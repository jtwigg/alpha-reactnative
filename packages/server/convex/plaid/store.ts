import { internalMutation, internalQuery, query } from '../_generated/server';
import { v } from 'convex/values';
import { requireAllowedIdentity } from '../allowlist';

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
      // Shadow mode until the explicit per-institution cutover.
      live: false,
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
