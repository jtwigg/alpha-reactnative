import { query } from '../_generated/server';
import { v } from 'convex/values';
import { requireAllowedIdentity } from '../allowlist';
import { isFinanceIdentityAllowed } from './auth';
import { todayInTimeZone } from './dates';
import {
  RANGE_KEYS,
  buildNetWorthModel,
  chartDates,
  grainForRange,
  loadAccountEnds,
  loadChartSnapshots,
  rangeWindow,
  type RangeKey,
  type SeriesSnapshot,
  type SnapshotLookup,
} from './series';
import {
  TOTAL_SCOPE_ID,
  chartPointsFromTotals,
  modelFromRollupPoints,
  readerMode,
  rollupCoversRange,
} from './rollups';
import { loadRollupRange, loadRollupStateView } from './rollupJobs';
import {
  CONVEX_QUERY_READ_BUDGET,
  accountDocValidator,
  holdingsArgsValidator,
  holdingDocValidator,
  netWorthResultValidator,
  pageArgsValidator,
  pageResultValidator,
  rangeKeyValidator,
  snapshotDocValidator,
  snapshotsArgsValidator,
  seriesChartResultValidator,
  twrRowValidator,
  flowRowValidator,
} from './validators';
import { TWR_WINDOWS, type TwrWindow } from './twrModel';
import {
  assertSeriesScope,
  coarseSeries,
  headerFromComputed,
  headerFromReturn,
  headerFromStoredSp500,
  seriesGrainForRange,
  seriesPointFromDoc,
  sp500ReturnScope,
  twrWindowForRange,
  type SeriesHeader,
  type SeriesPoint,
} from './seriesModel';
import type { QueryCtx } from '../_generated/server';

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

export function snapshotLookup(ctx: QueryCtx): SnapshotLookup {
  const one = async (
    accountId: string,
    order: 'asc' | 'desc',
    toDate?: string,
  ): Promise<SeriesSnapshot | null> => {
    const rows = await ctx.db
      .query('balance_snapshots')
      .withIndex('by_account_asOf', (q) => {
        const base = q.eq('accountId', accountId);
        return toDate ? base.lte('asOf', toDate) : base;
      })
      .order(order)
      .take(1);
    const row = rows[0];
    if (!row) return null;
    return {
      accountId: row.accountId,
      asOf: row.asOf,
      balance: row.balance,
      source: row.source,
    };
  };
  return {
    first: (accountId) => one(accountId, 'asc'),
    last: (accountId) => one(accountId, 'desc'),
    atOrBefore: (accountId, asOf) => one(accountId, 'desc', asOf),
  };
}

export const page = query({
  args: pageArgsValidator,
  returns: pageResultValidator,
  handler: async (ctx, args) => {
    await requireAllowedIdentity(ctx);
    const range = (args.range ?? 'All') as RangeKey;
    if (!(RANGE_KEYS as readonly string[]).includes(range)) {
      throw new Error('Invalid range');
    }
    const accounts = await ctx.db.query('accounts').take(80);
    const accountIds = accounts.map((row) => row.sourceId);
    const seriesAccounts = accounts.map((row) => ({
      sourceId: row.sourceId,
      name: row.name,
      class: row.class,
      provider: row.provider,
      currentBalance: row.currentBalance,
      currency: row.currency,
      syncedAt: row.syncedAt,
      coverageStart: row.coverageStart,
    }));
    const lookup = snapshotLookup(ctx);
    const ends = await loadAccountEnds(lookup, accountIds);
    const asOf = args.asOf ?? ends.maxAsOf ?? todayInTimeZone();
    const window = rangeWindow(range, asOf, ends.firstAsOf);
    const grain = grainForRange(range);
    const state = await loadRollupStateView(ctx);
    const rollupRows = await loadRollupRange(
      ctx,
      grain,
      'total',
      TOTAL_SCOPE_ID,
      window.from,
      window.to,
      2000,
    );
    const hasCoverage = rollupCoversRange({
      rows: rollupRows,
      from: window.from,
      to: window.to,
      grain,
    });
    const freshness = readerMode({ state, hasCoverage, asOf });
    if (freshness !== 'raw') {
      return modelFromRollupPoints({
        accounts: seriesAccounts,
        firsts: ends.firstByAccount,
        lasts: ends.lastByAccount,
        points: chartPointsFromTotals(rollupRows),
        range,
        asOf,
        grain,
        rollup: freshness,
      });
    }
    const dates = chartDates(range, window.from, window.to);
    const chart = await loadChartSnapshots(
      lookup,
      accountIds,
      dates,
      CONVEX_QUERY_READ_BUDGET,
      ends,
    );
    return buildNetWorthModel({
      accounts: seriesAccounts,
      snapshots: chart.snapshots,
      range,
      asOf,
    });
  },
});

function latestAsOf(rows: Array<{ asOf: string }>): string | null {
  let max: string | null = null;
  for (const row of rows) {
    if (max == null || row.asOf > max) max = row.asOf;
  }
  return max;
}

async function latestReturnForWindow(
  ctx: QueryCtx,
  scope: string,
  window: TwrWindow,
): Promise<SeriesHeader | null> {
  const rows = await ctx.db
    .query('returns')
    .withIndex('by_scope_asOf', (q) => q.eq('scope', scope))
    .take(200);
  const asOf = latestAsOf(rows);
  if (!asOf) return null;
  const row = rows.find((item) => item.asOf === asOf && item.window === window);
  return row ? headerFromReturn(row) : null;
}

function headerForSeries(
  stored: SeriesHeader | null,
  points: SeriesPoint[],
  window: TwrWindow | null,
  valueOf: (point: SeriesPoint) => number,
): SeriesHeader | null {
  if (stored) return stored;
  return headerFromComputed(
    points.map((point) => ({ value: valueOf(point), netInvested: point.netInvested, asOf: point.asOf })),
    window,
  );
}

export const series = query({
  args: {
    scope: v.string(),
    range: rangeKeyValidator,
    asOf: v.optional(v.string()),
    refreshNonce: v.optional(v.number()),
  },
  returns: seriesChartResultValidator,
  handler: async (ctx, args) => {
    await requireAllowedIdentity(ctx);
    assertSeriesScope(args.scope);
    const range = args.range;
    const grain = seriesGrainForRange(range);
    const first = await ctx.db
      .query('series')
      .withIndex('by_scope_date', (q) => q.eq('scope', args.scope))
      .order('asc')
      .take(1);
    const last = await ctx.db
      .query('series')
      .withIndex('by_scope_date', (q) => q.eq('scope', args.scope))
      .order('desc')
      .take(1);
    const asOf = args.asOf ?? last[0]?.date ?? todayInTimeZone();
    const window = rangeWindow(range, asOf, first[0]?.date ?? null);
    const state = await loadRollupStateView(ctx);
    const rollupRows = await loadRollupRange(
      ctx,
      grain,
      'series',
      args.scope,
      window.from,
      window.to,
      2000,
    );
    const hasCoverage = rollupCoversRange({
      rows: rollupRows,
      from: window.from,
      to: window.to,
      grain,
    });
    const freshness = readerMode({ state, hasCoverage, asOf });
    let points: SeriesPoint[];
    if (freshness !== 'raw') {
      points = rollupRows.map((row) => seriesPointFromDoc(row));
    } else {
      const prior = await ctx.db
        .query('series')
        .withIndex('by_scope_date', (q) => q.eq('scope', args.scope).lt('date', window.from))
        .order('desc')
        .take(1);
      const inside = await ctx.db
        .query('series')
        .withIndex('by_scope_date', (q) =>
          q.eq('scope', args.scope).gte('date', window.from).lte('date', window.to),
        )
        .take(2000);
      const raw = [...prior, ...inside]
        .map((row) => seriesPointFromDoc(row))
        .filter((point) => point.asOf);
      points =
        grain === 'day'
          ? raw.filter((point) => point.asOf >= window.from && point.asOf <= window.to)
          : coarseSeries(raw, grain, window.from, window.to);
    }
    const twrWindow = twrWindowForRange(range);
    const storedTwr = twrWindow ? await latestReturnForWindow(ctx, args.scope, twrWindow) : null;
    const storedSp500 = twrWindow
      ? await latestReturnForWindow(ctx, sp500ReturnScope(args.scope), twrWindow)
      : null;
    return {
      scope: args.scope,
      range,
      asOf,
      grain,
      rollup: freshness,
      points,
      twr: headerForSeries(storedTwr, points, twrWindow, (point) => point.value),
      sp500Twr: headerFromStoredSp500(storedSp500),
    };
  },
});

export const twr = query({
  args: { scope: v.string(), refreshNonce: v.optional(v.number()) },
  returns: v.object({
    scope: v.string(),
    asOf: v.union(v.string(), v.null()),
    windows: v.array(twrRowValidator),
  }),
  handler: async (ctx, args) => {
    await requireAllowedIdentity(ctx);
    const rows = await ctx.db
      .query('returns')
      .withIndex('by_scope_asOf', (q) => q.eq('scope', args.scope))
      .take(200);
    const asOf = latestAsOf(rows);
    const latest = asOf ? rows.filter((row) => row.asOf === asOf) : [];
    const order = new Map(TWR_WINDOWS.map((window, index) => [window, index]));
    latest.sort((a, b) => (order.get(a.window as TwrWindow) ?? 99) - (order.get(b.window as TwrWindow) ?? 99));
    return {
      scope: args.scope,
      asOf,
      windows: latest.map((row) => ({
        scope: row.scope,
        window: row.window,
        asOf: row.asOf,
        startDate: row.startDate,
        cumulative: row.cumulative,
        annualized: row.annualized ?? null,
        reliable: row.reliable,
        startOnAnchor: row.startOnAnchor,
        flowsFullyKnown: row.flowsFullyKnown,
        method: row.method,
        note: row.note ?? null,
      })),
    };
  },
});

export const flows = query({
  args: { accountId: v.string(), refreshNonce: v.optional(v.number()) },
  returns: v.array(flowRowValidator),
  handler: async (ctx, args) => {
    await requireAllowedIdentity(ctx);
    const rows = await ctx.db
      .query('flows')
      .withIndex('by_account_date', (q) => q.eq('accountId', args.accountId))
      .order('desc')
      .take(200);
    const out: Array<{
      flowId: string;
      accountId: string;
      date: string;
      amount: number;
      kind: 'internal_transfer' | 'roth_conversion' | 'external';
      counterpartAccountId: string | null;
      counterpartFlowId: string | null;
      counterpartTxnId: string | null;
      evidence: string | null;
      externalToInvestable: boolean;
      counterpart:
        | { type: 'transaction'; accountId: string; sourceId: string; name: string; date: string; amount: number }
        | { type: 'flow'; accountId: string; flowId: string; date: string; amount: number; kind: 'internal_transfer' | 'roth_conversion' | 'external' }
        | { type: 'account'; accountId: string; name: string }
        | null;
    }> = [];
    for (const row of rows) {
      let counterpart: (typeof out)[number]['counterpart'] = null;
      if (row.counterpartTxnId) {
        const txn = await ctx.db
          .query('transactions')
          .withIndex('by_sourceId', (q) => q.eq('sourceId', row.counterpartTxnId as string))
          .unique();
        if (txn) {
          counterpart = {
            type: 'transaction' as const,
            accountId: txn.accountId,
            sourceId: txn.sourceId,
            name: txn.name,
            date: txn.date,
            amount: txn.amount,
          };
        }
      } else if (row.counterpartFlowId) {
        const other = await ctx.db
          .query('flows')
          .withIndex('by_flowId', (q) => q.eq('flowId', row.counterpartFlowId as string))
          .unique();
        if (other) {
          counterpart = {
            type: 'flow' as const,
            accountId: other.accountId,
            flowId: other.flowId,
            date: other.date,
            amount: other.amount,
            kind: other.kind,
          };
        }
      } else if (row.counterpartAccountId) {
        const account = await ctx.db
          .query('accounts')
          .withIndex('by_sourceId', (q) => q.eq('sourceId', row.counterpartAccountId as string))
          .unique();
        counterpart = {
          type: 'account' as const,
          accountId: row.counterpartAccountId,
          name: account?.name ?? row.counterpartAccountId,
        };
      }
      out.push({
        flowId: row.flowId,
        accountId: row.accountId,
        date: row.date,
        amount: row.amount,
        kind: row.kind,
        counterpartAccountId: row.counterpartAccountId ?? null,
        counterpartFlowId: row.counterpartFlowId ?? null,
        counterpartTxnId: row.counterpartTxnId ?? null,
        evidence: row.evidence ?? null,
        externalToInvestable: row.externalToInvestable,
        counterpart,
      });
    }
    return out;
  },
});
