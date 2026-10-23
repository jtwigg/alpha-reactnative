import { query } from '../_generated/server';
import { v } from 'convex/values';
import { getFinanceIdentity, isFinanceSubjectAllowed, requireFinanceAccess } from './auth';

export const isAllowed = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const identity = await getFinanceIdentity(ctx);
    if (!identity) return false;
    return isFinanceSubjectAllowed(identity.subject);
  },
});

export const accounts = query({
  args: {},
  handler: async (ctx) => {
    await requireFinanceAccess(ctx);
    const rows = await ctx.db.query('accounts').collect();
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const snapshots = query({
  args: {
    accountId: v.optional(v.string()),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireFinanceAccess(ctx);
    const limit = Math.min(Math.max(args.limit ?? 500, 1), 2000);
    if (args.accountId) {
      let q = ctx.db
        .query('balance_snapshots')
        .withIndex('by_account_asOf', (idx) => {
          const base = idx.eq('accountId', args.accountId as string);
          if (args.from && args.to) {
            return base.gte('asOf', args.from).lte('asOf', args.to);
          }
          if (args.from) return base.gte('asOf', args.from);
          if (args.to) return base.lte('asOf', args.to);
          return base;
        });
      return await q.take(limit);
    }
    const rows = await ctx.db.query('balance_snapshots').take(limit);
    return rows
      .filter((row) => {
        if (args.from && row.asOf < args.from) return false;
        if (args.to && row.asOf > args.to) return false;
        return true;
      })
      .sort((a, b) => a.asOf.localeCompare(b.asOf));
  },
});

export const holdings = query({
  args: {
    accountId: v.optional(v.string()),
    asOf: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireFinanceAccess(ctx);
    if (args.accountId) {
      const rows = await ctx.db
        .query('holdings')
        .withIndex('by_account_asOf', (idx) => idx.eq('accountId', args.accountId as string))
        .take(1000);
      return args.asOf ? rows.filter((row) => row.asOf === args.asOf) : rows;
    }
    return await ctx.db.query('holdings').take(1000);
  },
});

export const netWorth = query({
  args: {},
  handler: async (ctx) => {
    await requireFinanceAccess(ctx);
    const accounts = await ctx.db.query('accounts').collect();
    const latestByAccount = new Map<
      string,
      { asOf: string; balance: number; source: string }
    >();
    for (const account of accounts) {
      const last = await ctx.db
        .query('balance_snapshots')
        .withIndex('by_account_asOf', (q) => q.eq('accountId', account.sourceId))
        .order('desc')
        .take(1);
      if (last[0]) {
        latestByAccount.set(account.sourceId, {
          asOf: last[0].asOf,
          balance: last[0].balance,
          source: last[0].source,
        });
      }
    }
    const byClass: Record<string, number> = {};
    let total = 0;
    for (const account of accounts) {
      const latest = latestByAccount.get(account.sourceId);
      const balance = latest?.balance ?? account.currentBalance;
      const sign = account.class === 'credit' || account.class === 'liability' ? -1 : 1;
      const signed = sign * balance;
      byClass[account.class] = (byClass[account.class] ?? 0) + signed;
      total += signed;
    }
    return {
      total,
      byClass,
      accounts: accounts.map((account) => ({
        sourceId: account.sourceId,
        name: account.name,
        class: account.class,
        currentBalance: account.currentBalance,
        currency: account.currency,
        syncedAt: account.syncedAt,
        coverageStart: account.coverageStart,
        latestSnapshot: latestByAccount.get(account.sourceId) ?? null,
      })),
    };
  },
});
