import { internalQuery } from '../_generated/server';
import { v } from 'convex/values';

/**
 * Read-only status for agents (MCP). Never includes tokens, cursors or balances.
 */
export const summary = internalQuery({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.db.query('plaid_items').collect();
    const open = await ctx.db
      .query('finance_proposed_deletions')
      .withIndex('by_status', (q) => q.eq('status', 'open'))
      .collect();
    const lastRun = await ctx.db.query('plaid_sync_runs').withIndex('by_startedAt').order('desc').first();
    return {
      syncEnabled: process.env.PLAID_SYNC_ENABLED === 'true',
      env: process.env.PLAID_ENV ?? null,
      items: items.map((item) => ({
        plaidItemId: item.plaidItemId,
        institutionName: item.institutionName ?? null,
        status: item.status,
        live: item.live,
        consecutiveFailures: item.consecutiveFailures,
        lastError: item.lastError ?? null,
        lastSyncedAt: item.lastSyncedAt ?? null,
        accountCount: item.accounts?.length ?? 0,
      })),
      openDeletionProposals: open.length,
      lastRun: lastRun
        ? {
            startedAt: lastRun.startedAt,
            finishedAt: lastRun.finishedAt ?? null,
            status: lastRun.status,
            abortReason: lastRun.abortReason ?? null,
            plaidCalls: lastRun.plaidCalls,
            mutations: lastRun.mutations,
          }
        : null,
    };
  },
});

export const recentRuns = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const take = Math.min(Math.max(Math.floor(limit ?? 10), 1), 50);
    const runs = await ctx.db.query('plaid_sync_runs').withIndex('by_startedAt').order('desc').take(take);
    return runs.map((run) => ({
      startedAt: run.startedAt,
      finishedAt: run.finishedAt ?? null,
      trigger: run.trigger,
      status: run.status,
      abortReason: run.abortReason ?? null,
      plaidCalls: run.plaidCalls,
      mutations: run.mutations,
      itemsSynced: run.itemsSynced,
      report: run.report ?? null,
    }));
  },
});
