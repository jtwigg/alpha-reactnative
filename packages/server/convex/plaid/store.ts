import { internalMutation, internalQuery, query } from '../_generated/server';
import { v } from 'convex/values';
import { requireAllowedIdentity } from '../allowlist';

const accountSummary = v.object({
  accountId: v.string(),
  name: v.string(),
  mask: v.optional(v.string()),
  type: v.string(),
  subtype: v.optional(v.string()),
});

const itemStatus = v.union(v.literal('active'), v.literal('needs_relink'), v.literal('paused'));

/** Client-safe view of linked institutions. Never includes tokens or cursors. */
export const listConnections = query({
  args: {},
  handler: async (ctx) => {
    await requireAllowedIdentity(ctx);
    const items = await ctx.db.query('plaid_items').collect();
    const proposals = await ctx.db
      .query('finance_proposed_deletions')
      .withIndex('by_status', (q) => q.eq('status', 'open'))
      .collect();
    return {
      items: items.map((item) => ({
        plaidItemId: item.plaidItemId,
        institutionName: item.institutionName ?? 'Linked institution',
        status: item.status,
        live: item.live,
        lastSyncedAt: item.lastSyncedAt ?? null,
        lastError: item.lastError ?? null,
        accounts: item.accounts ?? [],
      })),
      openDeletionProposals: proposals.length,
    };
  },
});

export const findByInstitution = internalQuery({
  args: { institutionId: v.string() },
  handler: async (ctx, { institutionId }) =>
    await ctx.db
      .query('plaid_items')
      .withIndex('by_institutionId', (q) => q.eq('institutionId', institutionId))
      .first(),
});

export const getItem = internalQuery({
  args: { plaidItemId: v.string() },
  handler: async (ctx, { plaidItemId }) =>
    await ctx.db
      .query('plaid_items')
      .withIndex('by_plaidItemId', (q) => q.eq('plaidItemId', plaidItemId))
      .first(),
});

export const listItems = internalQuery({
  args: {},
  handler: async (ctx) => await ctx.db.query('plaid_items').collect(),
});

export const insertItem = internalMutation({
  args: {
    plaidItemId: v.string(),
    institutionId: v.optional(v.string()),
    institutionName: v.optional(v.string()),
    encryptedAccessToken: v.string(),
    accounts: v.optional(v.array(accountSummary)),
  },
  handler: async (ctx, args) => {
    const dup = await ctx.db
      .query('plaid_items')
      .withIndex('by_plaidItemId', (q) => q.eq('plaidItemId', args.plaidItemId))
      .first();
    if (dup) return dup._id;
    return await ctx.db.insert('plaid_items', {
      ...args,
      status: 'active',
      // Plaid is the primary writer: new institutions sync into finance immediately.
      live: true,
      consecutiveFailures: 0,
      createdAt: Date.now(),
    });
  },
});

export const patchItem = internalMutation({
  args: {
    plaidItemId: v.string(),
    status: v.optional(itemStatus),
    cursor: v.optional(v.string()),
    consecutiveFailures: v.optional(v.number()),
    lastError: v.optional(v.union(v.string(), v.null())),
    lastSyncedAt: v.optional(v.number()),
    historyBuiltAt: v.optional(v.number()),
    accounts: v.optional(v.array(accountSummary)),
  },
  handler: async (ctx, { plaidItemId, lastError, ...rest }) => {
    const item = await ctx.db
      .query('plaid_items')
      .withIndex('by_plaidItemId', (q) => q.eq('plaidItemId', plaidItemId))
      .first();
    if (!item) return;
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rest)) if (value !== undefined) patch[key] = value;
    if (lastError !== undefined) patch.lastError = lastError ?? undefined;
    await ctx.db.patch(item._id, patch);
  },
});

export const accountMap = internalQuery({
  args: { plaidItemId: v.string() },
  handler: async (ctx, { plaidItemId }) =>
    await ctx.db
      .query('plaid_account_map')
      .withIndex('by_plaidItemId', (q) => q.eq('plaidItemId', plaidItemId))
      .collect(),
});

export const ensureAccountMap = internalMutation({
  args: {
    entries: v.array(
      v.object({
        plaidAccountId: v.string(),
        plaidItemId: v.string(),
        sourceId: v.string(),
        type: v.string(),
      }),
    ),
  },
  handler: async (ctx, { entries }) => {
    for (const entry of entries) {
      const existing = await ctx.db
        .query('plaid_account_map')
        .withIndex('by_plaidAccountId', (q) => q.eq('plaidAccountId', entry.plaidAccountId))
        .first();
      if (!existing) await ctx.db.insert('plaid_account_map', entry);
    }
  },
});

/**
 * Removes the item and its account map. Finance rows already written (accounts,
 * snapshots, transactions) are left alone: disconnecting stops syncing, it does
 * not delete history.
 */
export const deleteItem = internalMutation({
  args: { plaidItemId: v.string() },
  handler: async (ctx, { plaidItemId }) => {
    const item = await ctx.db
      .query('plaid_items')
      .withIndex('by_plaidItemId', (q) => q.eq('plaidItemId', plaidItemId))
      .first();
    if (item) await ctx.db.delete(item._id);
    const mapped = await ctx.db
      .query('plaid_account_map')
      .withIndex('by_plaidItemId', (q) => q.eq('plaidItemId', plaidItemId))
      .collect();
    for (const row of mapped) await ctx.db.delete(row._id);
    return { removed: Boolean(item), mapRows: mapped.length };
  },
});

/**
 * Accounts Alpha already holds that no Plaid account owns yet (written earlier
 * by the Finance assistant). These are the candidates for matching.
 */
export const legacyAccounts = internalQuery({
  args: {},
  handler: async (ctx) => {
    const mapped = new Set((await ctx.db.query('plaid_account_map').collect()).map((row) => row.sourceId));
    const accounts = await ctx.db.query('accounts').collect();
    return accounts
      .filter((a) => a.provider !== 'plaid' && !mapped.has(a.sourceId))
      .map((a) => ({
        sourceId: a.sourceId,
        provider: a.provider,
        class: a.class,
        name: a.name,
        ...(a.mask ? { mask: a.mask } : {}),
      }));
  },
});

/** Recent sync runs for the Sync logs screen. Reports hold counts and findings only, never tokens. */
export const syncLogs = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    await requireAllowedIdentity(ctx);
    const take = Math.min(Math.max(Math.floor(limit ?? 20), 1), 50);
    const runs = await ctx.db.query('plaid_sync_runs').withIndex('by_startedAt').order('desc').take(take);
    return {
      syncEnabled: process.env.PLAID_SYNC_ENABLED === 'true',
      runs: runs.map((run) => ({
        id: run._id as string,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt ?? null,
        trigger: run.trigger,
        status: run.status,
        abortReason: run.abortReason ?? null,
        plaidCalls: run.plaidCalls,
        mutations: run.mutations,
        itemsSynced: run.itemsSynced,
        report: run.report ?? null,
      })),
    };
  },
});
