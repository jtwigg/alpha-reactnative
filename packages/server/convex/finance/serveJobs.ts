import { internalMutation, internalQuery } from '../_generated/server';
import { internal } from '../_generated/api';
import { v } from 'convex/values';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { Doc } from '../_generated/dataModel';
import { loadRollupRange, loadRollupStateView } from './rollupJobs';
import {
  TOTAL_SCOPE_ID,
  chartPointsFromTotals,
  grainDates,
  modelFromRollupPoints,
  readerMode,
  rollupCoversRange,
  valuesFromAccountRollups,
  type RollupFreshness,
} from './rollups';
import {
  RANGE_KEYS,
  grainForRange,
  loadAccountEnds,
  rangeWindow,
  strideChartDates,
  type RangeKey,
  type SeriesSnapshot,
  type SnapshotLookup,
} from './series';
import {
  SPARKLINE_POINTS,
  accountHistory,
  addContributions,
  groupKeyForClass,
  groupSparklines,
  institutionLabel,
  sparklineRows,
  stackGrid,
  typeLabel,
} from './accountModel';
import {
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
import { todayInTimeZone } from './dates';
import type { TwrWindow } from './twrModel';
import {
  SERVE_PAGE_SCOPE,
  SERVE_SPARK_SCOPE,
  SERVE_STACK_SCOPE,
  classifyServeCheck,
  decodeCoverage,
  decodePoints,
  decodeSeriesPoints,
  diagnosisFromPairs,
  encodeCoverage,
  encodePoints,
  encodeSeriesPoints,
  isColumnarPoints,
  isColumnarSeries,
  sanitizePageAccounts,
  parsePayload,
  rangesOverlapping,
  stringifyPayload,
  type ServeAccountRange,
  type ServeCheckPair,
  type ServeKind,
  type ServePageRange,
  type ServeSeriesRange,
  type ServeSparkRange,
  type ServeStackRange,
} from './serve';

type DbCtx = MutationCtx | QueryCtx;

function snapshotLookup(ctx: DbCtx): SnapshotLookup {
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

export async function findServe(
  ctx: DbCtx,
  kind: ServeKind,
  scopeId: string,
  range: string,
): Promise<Doc<'finance_serve'> | null> {
  return await ctx.db
    .query('finance_serve')
    .withIndex('by_kind_scope_range', (q) => q.eq('kind', kind).eq('scopeId', scopeId).eq('range', range))
    .unique();
}

export async function loadServePayload<T>(
  ctx: DbCtx,
  kind: ServeKind,
  scopeId: string,
  range: string,
): Promise<{ row: Doc<'finance_serve'>; payload: T } | null> {
  const row = await findServe(ctx, kind, scopeId, range);
  if (!row) return null;
  return { row, payload: parsePayload<T>(row.payload) };
}

async function upsertServe(
  ctx: MutationCtx,
  doc: {
    kind: ServeKind;
    scopeId: string;
    range: string;
    version: number;
    asOf: string;
    grain: 'day' | 'week' | 'month';
    payload: unknown;
  },
): Promise<'inserted' | 'updated'> {
  const existing = await findServe(ctx, doc.kind, doc.scopeId, doc.range);
  const body = {
    kind: doc.kind,
    scopeId: doc.scopeId,
    range: doc.range,
    version: doc.version,
    asOf: doc.asOf,
    grain: doc.grain,
    payload: stringifyPayload(doc.payload),
    updatedAt: Date.now(),
  };
  if (existing) {
    await ctx.db.replace(existing._id, body);
    return 'updated';
  }
  await ctx.db.insert('finance_serve', body);
  return 'inserted';
}

function latestAsOf(rows: Array<{ asOf: string }>): string | null {
  let max: string | null = null;
  for (const row of rows) {
    if (max == null || row.asOf > max) max = row.asOf;
  }
  return max;
}

async function latestReturnForWindow(
  ctx: DbCtx,
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

type PageLive = {
  range: RangeKey;
  freshness: RollupFreshness;
  hasAccounts: boolean;
  hasRows: boolean;
  model: ReturnType<typeof modelFromRollupPoints> | null;
};

/**
 * Build a page from existing total rollup rows even while coverage is raw/stale.
 * Only skip when there are no rows — otherwise recomputeAll writes nothing and
 * checkConsistency reports a silent fail.
 */
async function loadPageRange(ctx: DbCtx, range: RangeKey): Promise<PageLive> {
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
  const asOf = ends.maxAsOf ?? todayInTimeZone();
  const window = rangeWindow(range, asOf, ends.firstAsOf);
  const grain = grainForRange(range);
  const state = await loadRollupStateView(ctx);
  const rollupRows = await loadRollupRange(ctx, grain, 'total', TOTAL_SCOPE_ID, window.from, window.to, 2000);
  const hasCoverage = rollupCoversRange({ rows: rollupRows, from: window.from, to: window.to, grain });
  const freshness = readerMode({ state, hasCoverage, asOf });
  if (rollupRows.length === 0) {
    return { range, freshness, hasAccounts: accounts.length > 0, hasRows: false, model: null };
  }
  return {
    range,
    freshness,
    hasAccounts: accounts.length > 0,
    hasRows: true,
    model: modelFromRollupPoints({
      accounts: seriesAccounts,
      firsts: ends.firstByAccount,
      lasts: ends.lastByAccount,
      points: chartPointsFromTotals(rollupRows),
      range,
      asOf,
      grain,
      rollup: freshness === 'raw' ? 'stale' : freshness,
    }),
  };
}

async function writePages(ctx: MutationCtx, ranges: RangeKey[], version: number): Promise<number> {
  let wrote = 0;
  for (const range of ranges) {
    const built = await loadPageRange(ctx, range);
    if (!built.model) continue;
    const payload: ServePageRange = {
      headline: built.model.headline,
      change: built.model.change,
      changePct: built.model.changePct,
      assets: built.model.assets,
      liabilities: built.model.liabilities,
      byClass: built.model.byClass,
      grain: built.model.grain,
      points: encodePoints(built.model.points),
      coverage: encodeCoverage(built.model.coverageMarkers),
    };
    await upsertServe(ctx, {
      kind: 'page',
      scopeId: SERVE_PAGE_SCOPE,
      range,
      version,
      asOf: built.model.asOf,
      grain: built.model.grain,
      payload: { ...payload, accounts: built.model.accounts, rollup: built.freshness === 'raw' ? 'stale' : built.model.rollup },
    });
    wrote += 1;
  }
  return wrote;
}

async function writeSparks(ctx: MutationCtx, ranges: RangeKey[], version: number): Promise<number> {
  const accounts = await ctx.db.query('accounts').take(80);
  const accountIds = accounts.map((row) => row.sourceId);
  const lookup = snapshotLookup(ctx);
  const ends = await loadAccountEnds(lookup, accountIds);
  const asOf = ends.maxAsOf ?? todayInTimeZone();
  let wrote = 0;
  for (const range of ranges) {
    const window = rangeWindow(range, asOf, ends.firstAsOf);
    const grain = grainForRange(range);
    const dates = strideChartDates(grainDates(grain, window.from, window.to), SPARKLINE_POINTS);
    const snapshots: Array<{ accountId: string; asOf: string; balance: number; source: 'observed' }> = [];
    let covered = 0;
    for (const account of accounts) {
      const rows = await loadRollupRange(ctx, grain, 'account', account.sourceId, window.from, window.to, 800);
      if (rows.length > 0) covered += 1;
      const values = valuesFromAccountRollups(dates, rows);
      dates.forEach((day, index) => {
        const value = values[index];
        if (value == null) return;
        snapshots.push({ accountId: account.sourceId, asOf: day, balance: value, source: 'observed' });
      });
    }
    if (covered === 0) continue;
    const computed = sparklineRows({ accounts, snapshots, dates });
    const weighted = addContributions(accounts, computed, groupSparklines(accounts, computed));
    const payload: ServeSparkRange = {
      dates,
      ids: weighted.rows.map((row) => row.sourceId),
      values: weighted.rows.map((row) => row.values),
      groupKeys: weighted.groups.map((row) => row.key),
      groupValues: weighted.groups.map((row) => row.values),
    };
    await upsertServe(ctx, {
      kind: 'sparklines',
      scopeId: SERVE_SPARK_SCOPE,
      range,
      version,
      asOf,
      grain,
      payload: { ...payload, rows: weighted.rows, groups: weighted.groups },
    });
    wrote += 1;
  }
  return wrote;
}

async function writeStacks(
  ctx: MutationCtx,
  ranges: RangeKey[],
  version: number,
  includeOverview = true,
): Promise<number> {
  const accounts = await ctx.db.query('accounts').take(80);
  const accountIds = accounts.map((row) => row.sourceId);
  const lookup = snapshotLookup(ctx);
  const ends = await loadAccountEnds(lookup, accountIds);
  const asOf = ends.maxAsOf ?? todayInTimeZone();
  let wrote = 0;
  const windows: Array<{ range: RangeKey; from?: string; to?: string }> = [
    ...(includeOverview ? [{ range: 'All' as RangeKey }] : []),
    ...ranges.map((range) => {
      const window = rangeWindow(range, asOf, ends.firstAsOf);
      return { range, from: window.from, to: window.to };
    }),
  ];
  const seen = new Set<string>();
  for (const item of windows) {
    const grid = stackGrid({ firstAsOf: ends.firstAsOf, asOf, from: item.from, to: item.to });
    const key = `${item.range}:${grid.from}:${grid.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const grain = grid.step === 'day' ? 'day' : 'week';
    const stackAccounts = [];
    let covered = 0;
    for (const account of accounts) {
      const rows = await loadRollupRange(ctx, grain, 'account', account.sourceId, grid.from, grid.to, 800);
      if (rows.length > 0) covered += 1;
      stackAccounts.push({
        sourceId: account.sourceId,
        name: account.name,
        class: account.class,
        group: groupKeyForClass(account.class),
        values: valuesFromAccountRollups(grid.dates, rows),
      });
    }
    if (covered === 0) continue;
    const payload: ServeStackRange = {
      from: grid.from,
      to: grid.to,
      step: grid.step,
      firstAsOf: ends.firstAsOf,
      dates: grid.dates,
      ids: stackAccounts.map((row) => row.sourceId),
      names: stackAccounts.map((row) => row.name),
      classes: stackAccounts.map((row) => row.class),
      groups: stackAccounts.map((row) => row.group),
      values: stackAccounts.map((row) => row.values),
    };
    await upsertServe(ctx, {
      kind: 'stack',
      scopeId: item.from ? item.range : SERVE_STACK_SCOPE,
      range: item.range,
      version,
      asOf,
      grain,
      payload: { ...payload, accounts: stackAccounts },
    });
    wrote += 1;
  }
  return wrote;
}

async function writeAccount(
  ctx: MutationCtx,
  sourceId: string,
  ranges: RangeKey[],
  version: number,
): Promise<number> {
  const account = await ctx.db
    .query('accounts')
    .withIndex('by_sourceId', (q) => q.eq('sourceId', sourceId))
    .unique();
  if (!account) return 0;
  const lookup = snapshotLookup(ctx);
  const ends = await loadAccountEnds(lookup, [account.sourceId]);
  const asOf = ends.maxAsOf ?? todayInTimeZone();
  let wrote = 0;
  for (const range of ranges) {
    const window = rangeWindow(range, asOf, ends.firstAsOf);
    const grain = grainForRange(range);
    const rows = await loadRollupRange(ctx, grain, 'account', account.sourceId, window.from, window.to, 2000);
    if (rows.length === 0) continue;
    const snapshots = rows.map((row) => ({
      accountId: account.sourceId,
      asOf: row.asOf,
      balance: row.value,
      source: row.interpolated ? ('interpolated' as const) : ('observed' as const),
    }));
    const history = accountHistory({ account, snapshots, range, asOf });
    const latest = ends.lastByAccount.get(account.sourceId) ?? null;
    const payload: ServeAccountRange = {
      change: history.change,
      changePct: history.changePct,
      firstAsOf: history.firstAsOf,
      grain,
      points: encodePoints(history.points),
    };
    await upsertServe(ctx, {
      kind: 'account',
      scopeId: account.sourceId,
      range,
      version,
      asOf,
      grain,
      payload: {
        ...payload,
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
      },
    });
    wrote += 1;
  }
  return wrote;
}

type SeriesLive = {
  hasSource: boolean;
  freshness: RollupFreshness;
  asOf: string | null;
  grain: 'day' | 'week' | 'month';
  points: SeriesPoint[];
};

async function loadSeriesRange(ctx: DbCtx, scope: string, range: RangeKey): Promise<SeriesLive> {
  const first = await ctx.db
    .query('series')
    .withIndex('by_scope_date', (q) => q.eq('scope', scope))
    .order('asc')
    .take(1);
  const last = await ctx.db
    .query('series')
    .withIndex('by_scope_date', (q) => q.eq('scope', scope))
    .order('desc')
    .take(1);
  const grain = seriesGrainForRange(range);
  if (!last[0]) {
    return { hasSource: false, freshness: 'raw', asOf: null, grain, points: [] };
  }
  const asOf = last[0].date;
  const window = rangeWindow(range, asOf, first[0]?.date ?? null);
  const state = await loadRollupStateView(ctx);
  const rollupRows = await loadRollupRange(ctx, grain, 'series', scope, window.from, window.to, 2000);
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
      .withIndex('by_scope_date', (q) => q.eq('scope', scope).lt('date', window.from))
      .order('desc')
      .take(1);
    const inside = await ctx.db
      .query('series')
      .withIndex('by_scope_date', (q) => q.eq('scope', scope).gte('date', window.from).lte('date', window.to))
      .take(2000);
    const raw = [...prior, ...inside].map((row) => seriesPointFromDoc(row));
    points =
      grain === 'day'
        ? raw.filter((point) => point.asOf >= window.from && point.asOf <= window.to)
        : coarseSeries(raw, grain, window.from, window.to);
  }
  return { hasSource: true, freshness, asOf, grain, points };
}

async function writeSeriesScope(
  ctx: MutationCtx,
  scope: string,
  ranges: RangeKey[],
  version: number,
): Promise<number> {
  let wrote = 0;
  for (const range of ranges) {
    const live = await loadSeriesRange(ctx, scope, range);
    if (!live.hasSource || live.asOf == null) return wrote;
    const twrWindow = twrWindowForRange(range);
    const storedTwr = twrWindow ? await latestReturnForWindow(ctx, scope, twrWindow) : null;
    const storedSp500 = twrWindow ? await latestReturnForWindow(ctx, sp500ReturnScope(scope), twrWindow) : null;
    const payload: ServeSeriesRange = {
      grain: live.grain,
      points: encodeSeriesPoints(live.points),
      twr: headerForSeries(storedTwr, live.points, twrWindow, (point) => point.value),
      sp500Twr: headerFromStoredSp500(storedSp500),
    };
    await upsertServe(ctx, {
      kind: 'series',
      scopeId: scope,
      range,
      version,
      asOf: live.asOf,
      grain: live.grain,
      payload: { ...payload, scope, rollup: live.freshness },
    });
    wrote += 1;
  }
  return wrote;
}

async function listSeriesScopes(ctx: DbCtx): Promise<string[]> {
  const accounts = await ctx.db.query('accounts').take(80);
  const scopes = new Set<string>(['total', 'reliable_subset']);
  for (const account of accounts) scopes.add(`account:${account.sourceId}`);
  const recent = await ctx.db.query('series').withIndex('by_date').order('desc').take(200);
  for (const row of recent) scopes.add(row.scope);
  return [...scopes].sort();
}

async function currentVersion(ctx: DbCtx): Promise<number> {
  const state = await loadRollupStateView(ctx);
  return state?.version ?? 0;
}

type WriteCursor = {
  step: 'page' | 'sparks' | 'stack' | 'accounts' | 'series';
  index: number;
  from: string;
};

function encodeCursor(cursor: WriteCursor): string {
  return JSON.stringify(cursor);
}

function decodeCursor(raw?: string | null): WriteCursor | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WriteCursor;
  } catch {
    return null;
  }
}

/**
 * Batched write of ready-to-serve chart docs from materialized rollups.
 * Scheduled after rebuildStep finishes, or by the admin recompute ops.
 */
export const writeAffected = internalMutation({
  args: {
    from: v.optional(v.string()),
    cursor: v.optional(v.string()),
    scopeKind: v.optional(v.string()),
    scopeId: v.optional(v.string()),
  },
  returns: v.object({
    done: v.boolean(),
    wrote: v.number(),
    step: v.string(),
  }),
  handler: async (ctx, args) => {
    const version = await currentVersion(ctx);
    const accounts = await ctx.db.query('accounts').take(80);
    const lookup = snapshotLookup(ctx);
    const ends = await loadAccountEnds(
      lookup,
      accounts.map((row) => row.sourceId),
    );
    const asOf = ends.maxAsOf ?? todayInTimeZone();
    const from = args.from ?? ends.firstAsOf ?? asOf;
    const ranges = args.scopeId && args.scopeKind
      ? [...RANGE_KEYS]
      : rangesOverlapping(from, asOf, ends.firstAsOf ?? from);
    const cursor = decodeCursor(args.cursor) ?? { step: 'page' as const, index: 0, from };
    const schedule = (next: WriteCursor) =>
      ctx.scheduler.runAfter(0, internal.finance.serveJobs.writeAffected, {
        from: next.from,
        cursor: encodeCursor(next),
        scopeKind: args.scopeKind,
        scopeId: args.scopeId,
      });

    if (args.scopeKind && args.scopeId) {
      if (args.scopeKind === 'page') {
        return { done: true, wrote: await writePages(ctx, ranges, version), step: 'page' };
      }
      if (args.scopeKind === 'sparklines') {
        return { done: true, wrote: await writeSparks(ctx, ranges, version), step: 'sparks' };
      }
      if (args.scopeKind === 'stack') {
        return { done: true, wrote: await writeStacks(ctx, ranges, version), step: 'stack' };
      }
      if (args.scopeKind === 'account') {
        return { done: true, wrote: await writeAccount(ctx, args.scopeId, ranges, version), step: 'accounts' };
      }
      if (args.scopeKind === 'series') {
        return { done: true, wrote: await writeSeriesScope(ctx, args.scopeId, ranges, version), step: 'series' };
      }
    }

    if (cursor.step === 'page') {
      const wrote = await writePages(ctx, ranges, version);
      await schedule({ step: 'sparks', index: 0, from });
      return { done: false, wrote, step: 'page' };
    }
    if (cursor.step === 'sparks') {
      const range = ranges[cursor.index];
      const wrote = range ? await writeSparks(ctx, [range], version) : 0;
      if (cursor.index + 1 < ranges.length) {
        await schedule({ step: 'sparks', index: cursor.index + 1, from });
        return { done: false, wrote, step: 'sparks' };
      }
      await schedule({ step: 'stack', index: 0, from });
      return { done: false, wrote, step: 'sparks' };
    }
    if (cursor.step === 'stack') {
      const range = ranges[cursor.index];
      const wrote = range ? await writeStacks(ctx, [range], version, cursor.index === 0) : 0;
      if (cursor.index + 1 < ranges.length) {
        await schedule({ step: 'stack', index: cursor.index + 1, from });
        return { done: false, wrote, step: 'stack' };
      }
      await schedule({ step: 'accounts', index: 0, from });
      return { done: false, wrote, step: 'stack' };
    }
    if (cursor.step === 'accounts') {
      const batch = accounts.slice(cursor.index, cursor.index + 8);
      let wrote = 0;
      for (const account of batch) wrote += await writeAccount(ctx, account.sourceId, ranges, version);
      if (cursor.index + 8 < accounts.length) {
        await schedule({ step: 'accounts', index: cursor.index + 8, from });
        return { done: false, wrote, step: 'accounts' };
      }
      await schedule({ step: 'series', index: 0, from });
      return { done: false, wrote, step: 'accounts' };
    }
    const scopes = await listSeriesScopes(ctx);
    const batch = scopes.slice(cursor.index, cursor.index + 4);
    let wrote = 0;
    for (const scope of batch) wrote += await writeSeriesScope(ctx, scope, ranges, version);
    if (cursor.index + 4 < scopes.length) {
      await schedule({ step: 'series', index: cursor.index + 4, from });
      return { done: false, wrote, step: 'series' };
    }
    return { done: true, wrote, step: 'series' };
  },
});

/** Recompute every ready-to-serve chart doc from current rollups. */
export const recomputeAll = internalMutation({
  args: {},
  returns: v.object({ scheduled: v.boolean() }),
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal.finance.serveJobs.writeAffected, {});
    return { scheduled: true };
  },
});

/** Recompute one scope (page | sparklines | stack | account:<id> | series scope). */
export const recomputeScope = internalMutation({
  args: {
    kind: v.union(
      v.literal('page'),
      v.literal('account'),
      v.literal('sparklines'),
      v.literal('stack'),
      v.literal('series'),
    ),
    scopeId: v.string(),
  },
  returns: v.object({ scheduled: v.boolean(), kind: v.string(), scopeId: v.string() }),
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, internal.finance.serveJobs.writeAffected, {
      scopeKind: args.kind,
      scopeId: args.scopeId,
    });
    return { scheduled: true, kind: args.kind, scopeId: args.scopeId };
  },
});

/** Recompute serve docs whose range window includes `from` (dirty-from-date). */
export const recomputeFrom = internalMutation({
  args: { from: v.string() },
  returns: v.object({ scheduled: v.boolean(), from: v.string() }),
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, internal.finance.serveJobs.writeAffected, { from: args.from });
    return { scheduled: true, from: args.from };
  },
});

const serveCheckPairValidator = v.object({
  kind: v.string(),
  scopeId: v.string(),
  range: v.string(),
  ok: v.boolean(),
  reason: v.string(),
  storedLen: v.union(v.number(), v.null()),
  liveLen: v.union(v.number(), v.null()),
  firstDiffIndex: v.union(v.number(), v.null()),
  storedAt: v.union(v.string(), v.null()),
  liveAt: v.union(v.string(), v.null()),
  storedValue: v.union(v.number(), v.null()),
  liveValue: v.union(v.number(), v.null()),
  serveVersion: v.union(v.number(), v.null()),
  serveUpdatedAt: v.union(v.number(), v.null()),
  serveAsOf: v.union(v.string(), v.null()),
  liveFreshness: v.union(v.string(), v.null()),
});

function serializeCheckPair(pair: ServeCheckPair) {
  return {
    kind: pair.kind,
    scopeId: pair.scopeId,
    range: pair.range,
    ok: pair.ok,
    reason: pair.reason,
    storedLen: pair.storedLen ?? null,
    liveLen: pair.liveLen ?? null,
    firstDiffIndex: pair.firstDiffIndex ?? null,
    storedAt: pair.storedAt ?? null,
    liveAt: pair.liveAt ?? null,
    storedValue: pair.storedValue ?? null,
    liveValue: pair.liveValue ?? null,
    serveVersion: pair.serveVersion ?? null,
    serveUpdatedAt: pair.serveUpdatedAt ?? null,
    serveAsOf: pair.serveAsOf ?? null,
    liveFreshness: pair.liveFreshness ?? null,
  };
}

async function countServeByKind(ctx: DbCtx): Promise<Record<ServeKind, number>> {
  const rows = await ctx.db.query('finance_serve').take(1000);
  const counts: Record<ServeKind, number> = {
    page: 0,
    account: 0,
    sparklines: 0,
    stack: 0,
    series: 0,
  };
  for (const row of rows) counts[row.kind] += 1;
  return counts;
}

async function seriesSourceExists(ctx: DbCtx, scope = 'total'): Promise<boolean> {
  const last = await ctx.db
    .query('series')
    .withIndex('by_scope_date', (q) => q.eq('scope', scope))
    .order('desc')
    .take(1);
  return last.length > 0;
}

/** Counts + rollup watermark so we can tell if writeAffected is still running. */
export const status = internalQuery({
  args: {},
  returns: v.object({
    rollup: v.object({
      status: v.union(v.string(), v.null()),
      version: v.number(),
      rebuiltThrough: v.union(v.string(), v.null()),
      dirtyFrom: v.union(v.string(), v.null()),
    }),
    serve: v.object({
      page: v.number(),
      series: v.number(),
      sparklines: v.number(),
      stack: v.number(),
      account: v.number(),
    }),
    seriesSource: v.boolean(),
  }),
  handler: async (ctx) => {
    const state = await loadRollupStateView(ctx);
    const serve = await countServeByKind(ctx);
    return {
      rollup: {
        status: state?.status ?? null,
        version: state?.version ?? 0,
        rebuiltThrough: state?.rebuiltThrough ?? null,
        dirtyFrom: state?.dirtyFrom ?? null,
      },
      serve: {
        page: serve.page,
        series: serve.series,
        sparklines: serve.sparklines,
        stack: serve.stack,
        account: serve.account,
      },
      seriesSource: await seriesSourceExists(ctx),
    };
  },
});

export const checkConsistency = internalQuery({
  args: { sample: v.optional(v.number()), kind: v.optional(v.string()), scopeId: v.optional(v.string()) },
  returns: v.object({
    ok: v.boolean(),
    diagnosis: v.string(),
    checked: v.number(),
    matched: v.number(),
    skipped: v.number(),
    rollupStatus: v.union(v.string(), v.null()),
    rollupVersion: v.number(),
    rebuiltThrough: v.union(v.string(), v.null()),
    dirtyFrom: v.union(v.string(), v.null()),
    serveCounts: v.object({
      page: v.number(),
      series: v.number(),
      sparklines: v.number(),
      stack: v.number(),
      account: v.number(),
    }),
    seriesSource: v.boolean(),
    pairs: v.array(serveCheckPairValidator),
    mismatches: v.array(serveCheckPairValidator),
  }),
  handler: async (ctx, args) => {
    const sample = Math.min(Math.max(args.sample ?? 8, 1), 24);
    const kinds = (args.kind ? [args.kind] : ['page', 'series']) as ServeKind[];
    const state = await loadRollupStateView(ctx);
    const serveCounts = await countServeByKind(ctx);
    const seriesSource = await seriesSourceExists(ctx, args.scopeId ?? 'total');
    const pairs: ReturnType<typeof serializeCheckPair>[] = [];
    let matched = 0;
    let skipped = 0;
    for (const kind of kinds) {
      const scopeId = args.scopeId ?? (kind === 'page' ? SERVE_PAGE_SCOPE : 'total');
      for (const range of RANGE_KEYS.slice(0, Math.ceil(sample / kinds.length))) {
        const stored = await loadServePayload<ServePageRange & ServeSeriesRange>(ctx, kind, scopeId, range);
        const pair =
          kind === 'page'
            ? await checkPagePair(ctx, range, stored)
            : await checkSeriesPair(ctx, scopeId, range, stored);
        const serialized = serializeCheckPair(pair);
        pairs.push(serialized);
        if (pair.ok && pair.reason === 'no_source') skipped += 1;
        else if (pair.ok) matched += 1;
      }
    }
    const diagnosis = diagnosisFromPairs(pairs);
    return {
      ok: diagnosis === 'ok',
      diagnosis,
      checked: pairs.length,
      matched,
      skipped,
      rollupStatus: state?.status ?? null,
      rollupVersion: state?.version ?? 0,
      rebuiltThrough: state?.rebuiltThrough ?? null,
      dirtyFrom: state?.dirtyFrom ?? null,
      serveCounts,
      seriesSource,
      pairs,
      mismatches: pairs.filter((pair) => !pair.ok),
    };
  },
});

async function checkPagePair(
  ctx: DbCtx,
  range: RangeKey,
  stored: { row: Doc<'finance_serve'>; payload: ServePageRange } | null,
) {
  const live = await loadPageRange(ctx, range);
  return classifyServeCheck({
    kind: 'page',
    scopeId: SERVE_PAGE_SCOPE,
    range,
    hasServe: stored != null,
    hasSource: live.hasAccounts,
    liveAvailable: live.model != null,
    liveFreshness: live.freshness,
    storedValues: stored?.payload.points.totals,
    liveValues: live.model ? encodePoints(live.model.points).totals : undefined,
    storedDates: stored?.payload.points.dates,
    liveDates: live.model ? encodePoints(live.model.points).dates : undefined,
    serveVersion: stored?.row.version,
    serveUpdatedAt: stored?.row.updatedAt,
    serveAsOf: stored?.row.asOf,
  });
}

async function checkSeriesPair(
  ctx: DbCtx,
  scopeId: string,
  range: RangeKey,
  stored: { row: Doc<'finance_serve'>; payload: ServeSeriesRange } | null,
) {
  const live = await loadSeriesRange(ctx, scopeId, range);
  return classifyServeCheck({
    kind: 'series',
    scopeId,
    range,
    hasServe: stored != null,
    hasSource: live.hasSource,
    liveAvailable: live.hasSource,
    liveFreshness: live.freshness,
    storedValues: stored?.payload.points.value,
    liveValues: live.points.map((point) => point.value),
    storedDates: stored?.payload.points.dates,
    liveDates: live.points.map((point) => point.asOf),
    serveVersion: stored?.row.version,
    serveUpdatedAt: stored?.row.updatedAt,
    serveAsOf: stored?.row.asOf,
  });
}

export function expandPagePayload(
  row: Doc<'finance_serve'>,
  payload: ServePageRange & { accounts: unknown; rollup: 'live' | 'stale' | 'raw' },
) {
  if (!isColumnarPoints(payload?.points)) return null;
  const points = decodePoints(payload.points);
  if (points.length === 0) return null;
  return {
    range: row.range as RangeKey,
    asOf: row.asOf,
    headline: payload.headline ?? 0,
    change: payload.change ?? 0,
    changePct: payload.changePct ?? null,
    assets: payload.assets ?? 0,
    liabilities: payload.liabilities ?? 0,
    byClass: payload.byClass ?? {},
    points,
    coverageMarkers: decodeCoverage(payload.coverage),
    accounts: sanitizePageAccounts(payload.accounts),
    grain: payload.grain ?? 'day',
    rollup: payload.rollup === 'live' || payload.rollup === 'raw' ? payload.rollup : 'stale',
  };
}

export function expandSeriesPayload(
  row: Doc<'finance_serve'>,
  payload: ServeSeriesRange & { scope: string; rollup: 'live' | 'stale' | 'raw' },
) {
  if (!isColumnarSeries(payload?.points)) return null;
  return {
    scope: payload.scope,
    range: row.range as RangeKey,
    asOf: row.asOf,
    grain: payload.grain ?? 'day',
    rollup: payload.rollup === 'live' || payload.rollup === 'raw' ? payload.rollup : 'stale',
    points: decodeSeriesPoints(payload.points),
    twr: payload.twr ?? null,
    sp500Twr: payload.sp500Twr ?? null,
  };
}

export { decodePoints, decodeSeriesPoints };
