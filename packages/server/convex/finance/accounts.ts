import { paginationOptsValidator, paginationResultValidator } from 'convex/server';
import { v } from 'convex/values';
import { query } from '../_generated/server';
import { requireAllowedIdentity } from '../allowlist';
import {
  ACCOUNT_LIST_CAP,
  HOLDINGS_CAP,
  addContributions,
  SPARKLINE_POINTS,
  groupKeyForClass,
  stackGrid,
  accountHistory,
  clampPageSize,
  groupAccounts,
  groupSparklines,
  holdingsView,
  institutionLabel,
  sparklineRows,
  toListRow,
  typeLabel,
} from './accountModel';
import { isIsoDate, todayInTimeZone } from './dates';
import { snapshotLookup } from './queries';
import {
  RANGE_KEYS,
  chartDates,
  loadAccountEnds,
  loadChartSnapshots,
  rangeWindow,
  strideChartDates,
  type RangeKey,
} from './series';
import {
  CONVEX_QUERY_READ_BUDGET,
  chartPointValidator,
  rangeKeyValidator,
  snapshotSourceValidator,
  transactionKindValidator,
} from './validators';

const listRowValidator = v.object({
  sourceId: v.string(),
  name: v.string(),
  mask: v.union(v.string(), v.null()),
  institution: v.string(),
  type: v.string(),
  class: v.string(),
  currency: v.string(),
  balance: v.number(),
  signedBalance: v.number(),
  lastUpdated: v.string(),
  isManual: v.boolean(),
});

const groupValidator = v.object({
  key: v.union(
    v.literal('cash'),
    v.literal('investments'),
    v.literal('real_estate'),
    v.literal('liability'),
    v.literal('other'),
  ),
  label: v.string(),
  subtotal: v.number(),
  count: v.number(),
  accounts: v.array(listRowValidator),
});

/** All accounts grouped by class. One indexed latest-snapshot read per account. */
export const list = query({
  args: { refreshNonce: v.optional(v.number()) },
  returns: v.object({ total: v.number(), groups: v.array(groupValidator) }),
  handler: async (ctx) => {
    await requireAllowedIdentity(ctx);
    const accounts = await ctx.db.query('accounts').take(ACCOUNT_LIST_CAP);
    const lookup = snapshotLookup(ctx);
    const rows = [];
    for (const account of accounts) {
      const latest = await lookup.last(account.sourceId);
      rows.push(
        toListRow(
          account,
          latest ? { asOf: latest.asOf, balance: latest.balance, source: latest.source } : null,
        ),
      );
    }
    return groupAccounts(rows);
  },
});

const toneValidator = v.union(v.literal('good'), v.literal('bad'), v.literal('flat'));

/** `pct` is a fraction of the parent's start (group for accounts, net worth for groups). */
const contributionValidator = v.object({
  change: v.number(),
  pct: v.union(v.number(), v.null()),
  tone: toneValidator,
});

const sparklineRowValidator = v.object({
  sourceId: v.string(),
  values: v.array(v.union(v.number(), v.null())),
  change: v.number(),
  changePct: v.union(v.number(), v.null()),
  tone: toneValidator,
  weighted: contributionValidator,
});

const groupSparklineValidator = v.object({
  key: v.union(
    v.literal('cash'),
    v.literal('investments'),
    v.literal('real_estate'),
    v.literal('liability'),
    v.literal('other'),
  ),
  values: v.array(v.union(v.number(), v.null())),
  change: v.number(),
  changePct: v.union(v.number(), v.null()),
  tone: toneValidator,
  weighted: contributionValidator,
});

/**
 * Downsampled balance lines for every account over one range, in a single
 * query. Each account costs two end reads plus one at-or-before probe per
 * grid date; the grid shrinks when there are many accounts so the total stays
 * under the read budget.
 */
export const sparklines = query({
  args: { range: rangeKeyValidator, refreshNonce: v.optional(v.number()) },
  returns: v.object({
    range: rangeKeyValidator,
    asOf: v.string(),
    dates: v.array(v.string()),
    rows: v.array(sparklineRowValidator),
    groups: v.array(groupSparklineValidator),
    documentsRead: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireAllowedIdentity(ctx);
    const range = args.range as RangeKey;
    if (!(RANGE_KEYS as readonly string[]).includes(range)) {
      throw new Error('Invalid range');
    }
    const accounts = await ctx.db.query('accounts').take(ACCOUNT_LIST_CAP);
    const accountIds = accounts.map((row) => row.sourceId);
    const lookup = snapshotLookup(ctx);
    const ends = await loadAccountEnds(lookup, accountIds);
    const asOf = ends.maxAsOf ?? todayInTimeZone();
    const window = rangeWindow(range, asOf, ends.firstAsOf);
    const dates = strideChartDates(chartDates(range, window.from, window.to), SPARKLINE_POINTS);
    const chart = await loadChartSnapshots(
      lookup,
      accountIds,
      dates,
      CONVEX_QUERY_READ_BUDGET - accounts.length,
      ends,
    );
    const rows = sparklineRows({ accounts, snapshots: chart.snapshots, dates });
    const weighted = addContributions(accounts, rows, groupSparklines(accounts, rows));
    return {
      range,
      asOf,
      dates,
      rows: weighted.rows,
      groups: weighted.groups,
      documentsRead: chart.documentsRead + accounts.length,
    };
  },
});

const groupKeyValidator = v.union(
  v.literal('cash'),
  v.literal('investments'),
  v.literal('real_estate'),
  v.literal('liability'),
  v.literal('other'),
);

/**
 * Per-account balances for the stacked composition chart. With no window it
 * covers the full history (weekly), which drives the navigator overview;
 * with `from`/`to` it returns the zoomed window (daily up to 120 days).
 * Same per-account indexed probes and read budget as `sparklines`.
 */
export const stack = query({
  args: {
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    refreshNonce: v.optional(v.number()),
  },
  returns: v.object({
    asOf: v.string(),
    firstAsOf: v.union(v.string(), v.null()),
    from: v.string(),
    to: v.string(),
    step: v.union(v.literal('day'), v.literal('week')),
    dates: v.array(v.string()),
    accounts: v.array(
      v.object({
        sourceId: v.string(),
        name: v.string(),
        class: v.string(),
        group: groupKeyValidator,
        values: v.array(v.union(v.number(), v.null())),
      }),
    ),
    documentsRead: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireAllowedIdentity(ctx);
    for (const value of [args.from, args.to]) {
      if (value !== undefined && !isIsoDate(value)) throw new Error('Invalid date');
    }
    const accounts = await ctx.db.query('accounts').take(ACCOUNT_LIST_CAP);
    const accountIds = accounts.map((row) => row.sourceId);
    const lookup = snapshotLookup(ctx);
    const ends = await loadAccountEnds(lookup, accountIds);
    const asOf = ends.maxAsOf ?? todayInTimeZone();
    const grid = stackGrid({ firstAsOf: ends.firstAsOf, asOf, from: args.from, to: args.to });
    const chart = await loadChartSnapshots(
      lookup,
      accountIds,
      grid.dates,
      CONVEX_QUERY_READ_BUDGET - accounts.length,
      ends,
    );
    const rows = sparklineRows({ accounts, snapshots: chart.snapshots, dates: grid.dates });
    return {
      asOf,
      firstAsOf: ends.firstAsOf,
      ...grid,
      accounts: accounts.map((account, index) => ({
        sourceId: account.sourceId,
        name: account.name,
        class: account.class,
        group: groupKeyForClass(account.class),
        values: rows[index].values,
      })),
      documentsRead: chart.documentsRead + accounts.length,
    };
  },
});

const detailValidator = v.object({
  sourceId: v.string(),
  name: v.string(),
  institution: v.string(),
  typeLabel: v.string(),
  provider: v.string(),
  connectionId: v.union(v.string(), v.null()),
  class: v.string(),
  mask: v.union(v.string(), v.null()),
  type: v.string(),
  subtype: v.union(v.string(), v.null()),
  currentBalance: v.number(),
  availableBalance: v.union(v.number(), v.null()),
  currency: v.string(),
  syncedAt: v.number(),
  updatedAt: v.number(),
  coverageStart: v.union(v.string(), v.null()),
  latestSnapshot: v.union(
    v.object({ asOf: v.string(), balance: v.number(), source: snapshotSourceValidator }),
    v.null(),
  ),
  history: v.object({
    range: rangeKeyValidator,
    asOf: v.string(),
    points: v.array(chartPointValidator),
    change: v.number(),
    changePct: v.union(v.number(), v.null()),
    firstAsOf: v.union(v.string(), v.null()),
  }),
});

export const detail = query({
  args: {
    sourceId: v.string(),
    range: v.optional(rangeKeyValidator),
    refreshNonce: v.optional(v.number()),
  },
  returns: v.union(detailValidator, v.null()),
  handler: async (ctx, args) => {
    await requireAllowedIdentity(ctx);
    const range = (args.range ?? '1Y') as RangeKey;
    if (!(RANGE_KEYS as readonly string[]).includes(range)) {
      throw new Error('Invalid range');
    }
    const account = await ctx.db
      .query('accounts')
      .withIndex('by_sourceId', (q) => q.eq('sourceId', args.sourceId))
      .unique();
    if (!account) return null;

    const lookup = snapshotLookup(ctx);
    const ends = await loadAccountEnds(lookup, [account.sourceId]);
    const asOf = ends.maxAsOf ?? todayInTimeZone();
    const window = rangeWindow(range, asOf, ends.firstAsOf);
    const dates = chartDates(range, window.from, window.to);
    const chart = await loadChartSnapshots(
      lookup,
      [account.sourceId],
      dates,
      CONVEX_QUERY_READ_BUDGET,
      ends,
    );
    const history = accountHistory({ account, snapshots: chart.snapshots, range, asOf });
    const latest = ends.lastByAccount.get(account.sourceId) ?? null;

    return {
      sourceId: account.sourceId,
      name: account.name,
      institution: institutionLabel(account.provider, account.connectionId),
      typeLabel: typeLabel(account.type, account.subtype),
      provider: account.provider,
      connectionId: account.connectionId ?? null,
      class: account.class,
      mask: account.mask ?? null,
      type: account.type,
      subtype: account.subtype ?? null,
      currentBalance: account.currentBalance,
      availableBalance: account.availableBalance ?? null,
      currency: account.currency,
      syncedAt: account.syncedAt,
      updatedAt: account.updatedAt,
      coverageStart: account.coverageStart ?? null,
      latestSnapshot: latest
        ? { asOf: latest.asOf, balance: latest.balance, source: latest.source }
        : null,
      history,
    };
  },
});

const transactionRowValidator = v.object({
  _id: v.id('transactions'),
  sourceId: v.string(),
  date: v.string(),
  description: v.string(),
  merchant: v.union(v.string(), v.null()),
  amount: v.number(),
  direction: v.string(),
  category: v.union(v.string(), v.null()),
  pending: v.boolean(),
  kind: transactionKindValidator,
});

/** Newest first on (accountId, date). Page size is clamped to 100. */
export const transactions = query({
  args: { sourceId: v.string(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(transactionRowValidator),
  handler: async (ctx, args) => {
    await requireAllowedIdentity(ctx);
    const result = await ctx.db
      .query('transactions')
      .withIndex('by_account_date', (q) => q.eq('accountId', args.sourceId))
      .order('desc')
      .paginate({
        ...args.paginationOpts,
        numItems: clampPageSize(args.paginationOpts.numItems),
      });
    return {
      ...result,
      page: result.page.map((row) => ({
        _id: row._id,
        sourceId: row.sourceId,
        date: row.date,
        description: row.merchant ?? row.name,
        merchant: row.merchant ?? null,
        amount: row.amount,
        direction: row.direction,
        category: row.category ?? null,
        pending: row.pending,
        kind: row.kind,
      })),
    };
  },
});

const holdingRowValidator = v.object({
  symbol: v.string(),
  name: v.string(),
  quantity: v.number(),
  price: v.union(v.number(), v.null()),
  value: v.number(),
  pctOfAccount: v.union(v.number(), v.null()),
});

/** Latest holdings snapshot only: one desc probe, then that asOf's rows. */
export const holdings = query({
  args: { sourceId: v.string(), accountValue: v.optional(v.number()) },
  returns: v.object({
    asOf: v.union(v.string(), v.null()),
    total: v.number(),
    rows: v.array(holdingRowValidator),
  }),
  handler: async (ctx, args) => {
    await requireAllowedIdentity(ctx);
    const newest = await ctx.db
      .query('holdings')
      .withIndex('by_account_asOf', (q) => q.eq('accountId', args.sourceId))
      .order('desc')
      .take(1);
    const asOf = newest[0]?.asOf;
    if (!asOf) return { asOf: null, total: 0, rows: [] };
    const rows = await ctx.db
      .query('holdings')
      .withIndex('by_account_asOf', (q) => q.eq('accountId', args.sourceId).eq('asOf', asOf))
      .take(HOLDINGS_CAP);
    return holdingsView(rows, args.accountValue);
  },
});
