import { internalMutation, internalQuery } from '../_generated/server';
import { v } from 'convex/values';
import { SYNC_CAPS, runDue } from './model';

/** A `running` row older than this is treated as a crashed run, not a live lock. */
const STALE_LOCK_MS = 30 * 60_000;

/**
 * Takes the run lock. Returns null (and starts nothing) when the kill switch
 * is off, another run holds the lock, or a scheduled run is not yet due.
 */
export const startRun = internalMutation({
  args: { trigger: v.union(v.literal('cron'), v.literal('manual')), now: v.number() },
  handler: async (ctx, { trigger, now }) => {
    if (process.env.PLAID_SYNC_ENABLED !== 'true') return { runId: null, skipped: 'disabled' };

    const recent = await ctx.db
      .query('plaid_sync_runs')
      .withIndex('by_startedAt')
      .order('desc')
      .take(5);
    if (recent.some((run) => run.status === 'running' && now - run.startedAt < STALE_LOCK_MS)) {
      return { runId: null, skipped: 'locked' };
    }
    if (trigger === 'cron') {
      const last = recent.find((run) => run.trigger === 'cron');
      if (!runDue(last?.startedAt ?? null, now)) return { runId: null, skipped: 'not_due' };
    }
    const runId = await ctx.db.insert('plaid_sync_runs', {
      startedAt: now,
      trigger,
      status: 'running',
      plaidCalls: 0,
      mutations: 0,
      itemsSynced: 0,
    });
    return { runId, skipped: null };
  },
});

export const finishRun = internalMutation({
  args: {
    runId: v.id('plaid_sync_runs'),
    status: v.union(v.literal('ok'), v.literal('aborted'), v.literal('failed')),
    abortReason: v.optional(v.string()),
    plaidCalls: v.number(),
    mutations: v.number(),
    itemsSynced: v.number(),
    report: v.any(),
  },
  handler: async (ctx, { runId, ...rest }) => {
    await ctx.db.patch(runId, { ...rest, finishedAt: Date.now() });
  },
});

/** Stored rows in a date window for one account, for content dedupe. Bounded read. */
export const existingTransactions = internalQuery({
  args: { accountId: v.string(), from: v.string(), to: v.string() },
  handler: async (ctx, { accountId, from, to }) => {
    const rows = await ctx.db
      .query('transactions')
      .withIndex('by_account_date', (q) => q.eq('accountId', accountId).gte('date', from).lte('date', to))
      .take(2000);
    return rows.map((row) => ({
      sourceId: row.sourceId,
      accountId: row.accountId,
      date: row.date,
      amount: row.amount,
      name: row.name,
      ...(row.merchant ? { merchant: row.merchant } : {}),
    }));
  },
});

/**
 * Plaid "removed" ids become proposals only. A removal for a row Alpha does
 * not hold is ignored, and an open proposal is not duplicated.
 */
export const proposeDeletions = internalMutation({
  args: { transactionSourceIds: v.array(v.string()), reason: v.union(v.literal('plaid_removed'), v.literal('stale_pending')) },
  handler: async (ctx, { transactionSourceIds, reason }) => {
    let created = 0;
    for (const id of transactionSourceIds) {
      const row = await ctx.db
        .query('transactions')
        .withIndex('by_sourceId', (q) => q.eq('sourceId', id))
        .first();
      if (!row) continue;
      const open = await ctx.db
        .query('finance_proposed_deletions')
        .withIndex('by_transactionSourceId', (q) => q.eq('transactionSourceId', id))
        .filter((q) => q.eq(q.field('status'), 'open'))
        .first();
      if (open) continue;
      await ctx.db.insert('finance_proposed_deletions', {
        transactionSourceId: id,
        reason,
        proposedAt: Date.now(),
        status: 'open',
      });
      created += 1;
    }
    return created;
  },
});

/** A proposal closes itself once its row is already gone. */
export const closeResolvedProposals = internalMutation({
  args: {},
  handler: async (ctx) => {
    const open = await ctx.db
      .query('finance_proposed_deletions')
      .withIndex('by_status', (q) => q.eq('status', 'open'))
      .take(SYNC_CAPS.maxMutations);
    let closed = 0;
    for (const proposal of open) {
      const row = await ctx.db
        .query('transactions')
        .withIndex('by_sourceId', (q) => q.eq('sourceId', proposal.transactionSourceId))
        .first();
      if (!row) {
        await ctx.db.patch(proposal._id, { status: 'closed' });
        closed += 1;
      }
    }
    return closed;
  },
});
