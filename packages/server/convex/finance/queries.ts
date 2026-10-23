import { query } from '../_generated/server';
import { v } from 'convex/values';
import { requireAllowedIdentity } from '../allowlist';
import { isFinanceIdentityAllowed } from './auth';
import { formatIsoDate } from './dates';
import { RANGE_KEYS, buildNetWorthModel, type RangeKey } from './series';
import {
  accountDocValidator,
  holdingsArgsValidator,
  holdingDocValidator,
  netWorthResultValidator,
  pageArgsValidator,
  pageResultValidator,
  snapshotDocValidator,
  snapshotsArgsValidator,
} from './validators';

export const isAllowed = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    return await isFinanceIdentityAllowed(ctx);
  },
});

export const accounts = query({
  args: {},
  returns: v.array(accountDocValidator),
  handler: async (ctx) => {
    await requireAllowedIdentity(ctx);
    const rows = await ctx.db.query('accounts').collect();
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const snapshots = query({
  args: snapshotsArgsValidator,
  returns: v.array(snapshotDocValidator),
  handler: async (ctx, args) => {
    await requireAllowedIdentity(ctx);
    const limit = Math.min(Math.max(args.limit ?? 500, 1), 2000);
    if (args.accountId) {
      const rows = await ctx.db
        .query('balance_snapshots')
        .withIndex('by_account_asOf', (idx) => {
          const base = idx.eq('accountId', args.accountId as string);
          if (args.from && args.to) {
            return base.gte('asOf', args.from).lte('asOf', args.to);
          }
          if (args.from) return base.gte('asOf', args.from);
          if (args.to) return base.lte('asOf', args.to);
          return base;
        })
        .take(limit);
      return rows;
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
  args: holdingsArgsValidator,
  returns: v.array(holdingDocValidator),
  handler: async (ctx, args) => {
    await requireAllowedIdentity(ctx);
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
  returns: netWorthResultValidator,
  handler: async (ctx) => {
    await requireAllowedIdentity(ctx);
    const rows = await ctx.db.query('accounts').collect();
    const latestByAccount = new Map<
      string,
      { asOf: string; balance: number; source: 'manual' | 'observed' | 'reconstructed' | 'interpolated' }
    >();
    const firstByAccount = new Map<string, string>();
    for (const account of rows) {
      const first = await ctx.db
        .query('balance_snapshots')
        .withIndex('by_account_asOf', (q) => q.eq('accountId', account.sourceId))
        .order('asc')
        .take(1);
      const last = await ctx.db
        .query('balance_snapshots')
        .withIndex('by_account_asOf', (q) => q.eq('accountId', account.sourceId))
        .order('desc')
        .take(1);
      if (first[0]) firstByAccount.set(account.sourceId, first[0].asOf);
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
    const accounts = rows.map((account) => {
      const latest = latestByAccount.get(account.sourceId) ?? null;
      const balance = latest?.balance ?? account.currentBalance;
      const sign = account.class === 'credit' || account.class === 'liability' ? -1 : 1;
      const signed = sign * balance;
      byClass[account.class] = (byClass[account.class] ?? 0) + signed;
      total += signed;
      return {
        sourceId: account.sourceId,
        name: account.name,
        class: account.class,
        provider: account.provider,
        isManual: account.provider === 'manual',
        currentBalance: account.currentBalance,
        signedBalance: signed,
        currency: account.currency,
        syncedAt: account.syncedAt,
        coverageStart: account.coverageStart,
        firstAsOf: firstByAccount.get(account.sourceId) ?? null,
        latestSnapshot: latest,
      };
    });
    return { total, byClass, accounts };
  },
});

export const page = query({
  args: pageArgsValidator,
  returns: pageResultValidator,
  handler: async (ctx, args) => {
    await requireAllowedIdentity(ctx);
    const range = (args.range ?? 'All') as RangeKey;
    if (!(RANGE_KEYS as readonly string[]).includes(range)) {
      throw new Error('Invalid range');
    }
    const asOf = args.asOf ?? formatIsoDate(new Date());
    const accounts = await ctx.db.query('accounts').take(80);
    const snapshots = await ctx.db.query('balance_snapshots').take(4000);
    return buildNetWorthModel({
      accounts: accounts.map((row) => ({
        sourceId: row.sourceId,
        name: row.name,
        class: row.class,
        provider: row.provider,
        currentBalance: row.currentBalance,
        currency: row.currency,
        syncedAt: row.syncedAt,
        coverageStart: row.coverageStart,
      })),
      snapshots: snapshots.map((row) => ({
        accountId: row.accountId,
        asOf: row.asOf,
        balance: row.balance,
        source: row.source,
      })),
      range,
      asOf,
    });
  },
});
