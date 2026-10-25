import {
  addDays,
  daysBetween,
  eachDate,
  eachMonthEnd,
  eachWeekEnd,
  parseIsoDate,
  todayInTimeZone,
} from './dates';
import { CONVEX_QUERY_READ_BUDGET } from './validators';
import { roundMoney, type SnapshotSource } from './hash';

export const RANGE_KEYS = ['1M', '3M', 'YTD', '1Y', '5Y', 'All'] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];
export type RollupGrain = 'day' | 'week' | 'month';
export type RollupFreshness = 'live' | 'stale' | 'raw';

/** Coarsest materialized grain that still fits the range. */
export function grainForRange(range: RangeKey): RollupGrain {
  if (range === '1M' || range === '3M' || range === 'YTD') return 'day';
  if (range === '1Y') return 'week';
  return 'month';
}

export const CHART_POINT_CAP = 160;

export const CHART_CLASSES = [
  'cash',
  'investments',
  'real_estate',
  'liability',
] as const;

export type SeriesAccount = {
  sourceId: string;
  name: string;
  class: string;
  provider: string;
  currentBalance: number;
  currency?: string;
  syncedAt: number;
  coverageStart?: string;
};

export type SeriesSnapshot = {
  accountId: string;
  asOf: string;
  balance: number;
  source: SnapshotSource;
};

export type ChartPoint = {
  asOf: string;
  total: number;
  interpolated: boolean;
  byClass: Record<string, number>;
};

export type CoverageMarker = {
  asOf: string;
  label: string;
  class: string;
  kind: 'account' | 'class';
};

export type PageAccount = {
  sourceId: string;
  name: string;
  class: string;
  provider: string;
  isManual: boolean;
  currentBalance: number;
  signedBalance: number;
  currency: string;
  syncedAt: number;
  coverageStart?: string;
  firstAsOf: string | null;
  latestSnapshot: { asOf: string; balance: number; source: SnapshotSource } | null;
};

export type NetWorthPageModel = {
  range: RangeKey;
  asOf: string;
  headline: number;
  change: number;
  changePct: number | null;
  assets: number;
  liabilities: number;
  byClass: Record<string, number>;
  points: ChartPoint[];
  coverageMarkers: CoverageMarker[];
  accounts: PageAccount[];
  grain: RollupGrain;
  rollup: RollupFreshness;
};

export function signedAmount(className: string, balance: number): number {
  return className === 'credit' || className === 'liability' ? -balance : balance;
}

export function rangeWindow(
  range: RangeKey,
  asOf: string,
  earliest: string | null,
): { from: string; to: string } {
  parseIsoDate(asOf);
  if (range === '1M') return { from: addDays(asOf, -30), to: asOf };
  if (range === '3M') return { from: addDays(asOf, -90), to: asOf };
  if (range === '1Y') return { from: addDays(asOf, -365), to: asOf };
  if (range === '5Y') {
    const from = addDays(asOf, -1826);
    return { from: earliest && earliest > from && earliest < asOf ? earliest : from, to: asOf };
  }
  if (range === 'YTD') return { from: `${asOf.slice(0, 4)}-01-01`, to: asOf };
  const from = earliest && earliest < asOf ? earliest : asOf;
  return { from, to: asOf };
}

type DatedSnap = { asOf: string; balance: number; source: SnapshotSource };

/**
 * Value on `day` for one account. `null` means the account is not yet in
 * coverage — callers must omit it from totals (never treat as 0).
 *
 * Gaps between two known points are linearly interpolated. After the last
 * point the last value is held flat (carry-forward), which is not a chart
 * interpolation segment.
 */
export function accountValueOnDay(
  snaps: DatedSnap[],
  day: string,
  current: { balance: number; asOf: string },
): { balance: number; source: SnapshotSource; interpolated: boolean } | null {
  const ordered = [...snaps].sort((a, b) => a.asOf.localeCompare(b.asOf));
  if (ordered.length === 0) {
    return null;
  }
  const first = ordered[0].asOf;
  if (day < first) return null;

  const exact = ordered.find((row) => row.asOf === day);
  if (exact) {
    return {
      balance: exact.balance,
      source: exact.source,
      interpolated: exact.source === 'interpolated',
    };
  }

  let left: DatedSnap | undefined;
  let right: DatedSnap | undefined;
  for (const row of ordered) {
    if (row.asOf < day) left = row;
    if (row.asOf > day) {
      right = row;
      break;
    }
  }

  if (left && right) {
    const span = daysBetween(left.asOf, right.asOf);
    const t = span === 0 ? 0 : daysBetween(left.asOf, day) / span;
    return {
      balance: roundMoney(left.balance + (right.balance - left.balance) * t),
      source: 'interpolated',
      interpolated: true,
    };
  }

  if (left) {
    return { balance: left.balance, source: left.source, interpolated: false };
  }

  return null;
}

export function chartStep(range: RangeKey): RollupGrain {
  return grainForRange(range);
}

/** Grain dates for the range: day / ISO week-end / month-end. Always includes `to`. */
export function chartDates(range: RangeKey, from: string, to: string): string[] {
  parseIsoDate(from);
  parseIsoDate(to);
  if (to < from) return [];
  const grain = chartStep(range);
  if (grain === 'month') return eachMonthEnd(from, to);
  if (grain === 'week') return eachWeekEnd(from, to);
  return eachDate(from, to);
}

export function strideChartDates(dates: string[], maxPoints: number): string[] {
  if (dates.length <= maxPoints) return dates;
  if (maxPoints <= 1) return [dates[dates.length - 1]];
  const last = dates.length - 1;
  const out: string[] = [];
  for (let i = 0; i < maxPoints; i += 1) {
    const index = Math.round((i * last) / (maxPoints - 1));
    const date = dates[index];
    if (out[out.length - 1] !== date) out.push(date);
  }
  return out;
}

export type SnapshotLookup = {
  first: (accountId: string) => Promise<SeriesSnapshot | null>;
  last: (accountId: string) => Promise<SeriesSnapshot | null>;
  atOrBefore: (accountId: string, asOf: string) => Promise<SeriesSnapshot | null>;
};

export type AccountEnds = {
  firstByAccount: Map<string, SeriesSnapshot>;
  lastByAccount: Map<string, SeriesSnapshot>;
  firstAsOf: string | null;
  maxAsOf: string | null;
  documentsRead: number;
};

export type LoadedChartSnapshots = AccountEnds & {
  snapshots: SeriesSnapshot[];
};

export async function loadAccountEnds(
  lookup: SnapshotLookup,
  accountIds: string[],
): Promise<AccountEnds> {
  let documentsRead = 0;
  const firstByAccount = new Map<string, SeriesSnapshot>();
  const lastByAccount = new Map<string, SeriesSnapshot>();
  for (const accountId of accountIds) {
    const first = await lookup.first(accountId);
    documentsRead += 1;
    const last = await lookup.last(accountId);
    documentsRead += 1;
    if (first) firstByAccount.set(accountId, first);
    if (last) lastByAccount.set(accountId, last);
  }
  const firstAsOf =
    [...firstByAccount.values()].map((row) => row.asOf).sort()[0] ?? null;
  const maxAsOf =
    [...lastByAccount.values()].map((row) => row.asOf).sort().at(-1) ?? null;
  return { firstByAccount, lastByAccount, firstAsOf, maxAsOf, documentsRead };
}

/**
 * Per-account indexed reads. First/last plus at-or-before probes on the
 * downsampled date grid. Never a capped table scan.
 */
export async function loadChartSnapshots(
  lookup: SnapshotLookup,
  accountIds: string[],
  dates: string[],
  budget = CONVEX_QUERY_READ_BUDGET,
  ends?: AccountEnds,
): Promise<LoadedChartSnapshots> {
  const resolved = ends ?? (await loadAccountEnds(lookup, accountIds));
  let documentsRead = resolved.documentsRead;
  const { firstByAccount, lastByAccount, firstAsOf, maxAsOf } = resolved;

  const remaining = Math.max(0, budget - documentsRead);
  const maxDates =
    accountIds.length === 0
      ? dates.length
      : Math.max(2, Math.floor(remaining / accountIds.length));
  const sampled = strideChartDates(dates, maxDates);

  const snapshots: SeriesSnapshot[] = [];
  const seen = new Set<string>();
  const add = (row: SeriesSnapshot) => {
    const key = `${row.accountId}|${row.asOf}`;
    if (seen.has(key)) return;
    seen.add(key);
    snapshots.push(row);
  };

  for (const row of firstByAccount.values()) add(row);
  for (const row of lastByAccount.values()) add(row);

  accountLoop: for (const accountId of accountIds) {
    const first = firstByAccount.get(accountId);
    const last = lastByAccount.get(accountId);
    if (!first || !last) continue;
    for (const date of sampled) {
      if (documentsRead >= budget) break accountLoop;
      if (date < first.asOf) continue;
      if (date >= last.asOf) continue;
      const row = await lookup.atOrBefore(accountId, date);
      documentsRead += 1;
      if (row) add(row);
    }
  }

  return {
    snapshots,
    documentsRead,
    firstByAccount,
    lastByAccount,
    firstAsOf,
    maxAsOf,
  };
}

export function memorySnapshotLookup(rows: SeriesSnapshot[]): SnapshotLookup {
  const byAccount = new Map<string, SeriesSnapshot[]>();
  for (const row of rows) {
    const list = byAccount.get(row.accountId) ?? [];
    list.push(row);
    byAccount.set(row.accountId, list);
  }
  for (const list of byAccount.values()) {
    list.sort((a, b) => a.asOf.localeCompare(b.asOf));
  }
  return {
    async first(accountId) {
      return byAccount.get(accountId)?.[0] ?? null;
    },
    async last(accountId) {
      const list = byAccount.get(accountId);
      return list?.[list.length - 1] ?? null;
    },
    async atOrBefore(accountId, asOf) {
      const list = byAccount.get(accountId);
      if (!list || list.length === 0) return null;
      let found: SeriesSnapshot | null = null;
      for (const row of list) {
        if (row.asOf <= asOf) found = row;
        else break;
      }
      return found;
    },
  };
}

export function downsamplePoints(
  points: ChartPoint[],
  keepDates: Iterable<string>,
  cap = CHART_POINT_CAP,
): ChartPoint[] {
  if (points.length <= cap) return points;
  const keep = new Set(keepDates);
  const indexes = new Set<number>([0, points.length - 1]);
  points.forEach((point, index) => {
    if (keep.has(point.asOf)) indexes.add(index);
    if (index > 0 && point.interpolated !== points[index - 1].interpolated) {
      indexes.add(index - 1);
      indexes.add(index);
    }
  });
  const step = Math.ceil(points.length / cap);
  for (let i = 0; i < points.length; i += step) indexes.add(i);
  return [...indexes]
    .sort((a, b) => a - b)
    .map((index) => points[index]);
}

export function buildNetWorthModel(args: {
  accounts: SeriesAccount[];
  snapshots: SeriesSnapshot[];
  range: RangeKey;
  asOf: string;
}): NetWorthPageModel {
  const { range, asOf } = args;
  parseIsoDate(asOf);

  const snapsByAccount = new Map<string, DatedSnap[]>();
  for (const snap of args.snapshots) {
    const list = snapsByAccount.get(snap.accountId) ?? [];
    list.push({ asOf: snap.asOf, balance: snap.balance, source: snap.source });
    snapsByAccount.set(snap.accountId, list);
  }
  for (const list of snapsByAccount.values()) {
    list.sort((a, b) => a.asOf.localeCompare(b.asOf));
  }

  const accounts: PageAccount[] = args.accounts
    .map((account) => {
      const snaps = snapsByAccount.get(account.sourceId) ?? [];
      const latest = snaps[snaps.length - 1] ?? null;
      const balance = latest?.balance ?? account.currentBalance;
      return {
        sourceId: account.sourceId,
        name: account.name,
        class: account.class,
        provider: account.provider,
        isManual: account.provider === 'manual',
        currentBalance: account.currentBalance,
        signedBalance: signedAmount(account.class, balance),
        currency: account.currency ?? 'USD',
        syncedAt: account.syncedAt,
        coverageStart: account.coverageStart,
        firstAsOf: snaps[0]?.asOf ?? null,
        latestSnapshot: latest,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const earliest = accounts
    .map((account) => account.firstAsOf)
    .filter((value): value is string => Boolean(value))
    .sort()[0] ?? null;
  const window = rangeWindow(range, asOf, earliest);
  const days = strideChartDates(
    chartDates(range, window.from, window.to),
    CHART_POINT_CAP,
  );

  const daily: ChartPoint[] = [];
  for (const day of days) {
    const byClass: Record<string, number> = {};
    let total = 0;
    let interpolated = false;
    let covered = 0;
    for (const account of accounts) {
      const snaps = snapsByAccount.get(account.sourceId) ?? [];
      const value = accountValueOnDay(snaps, day, {
        balance: account.currentBalance,
        asOf,
      });
      if (!value) continue;
      covered += 1;
      const signed = signedAmount(account.class, value.balance);
      byClass[account.class] = (byClass[account.class] ?? 0) + signed;
      total += signed;
      if (value.interpolated) interpolated = true;
    }
    if (covered === 0) continue;
    daily.push({ asOf: day, total: roundMoney(total), interpolated, byClass });
  }

  const classFirst = new Map<string, { asOf: string; label: string }>();
  const coverageMarkers: CoverageMarker[] = [];
  for (const account of accounts) {
    if (!account.firstAsOf) continue;
    const existing = classFirst.get(account.class);
    if (!existing || account.firstAsOf < existing.asOf) {
      classFirst.set(account.class, { asOf: account.firstAsOf, label: account.class });
    }
  }
  for (const [className, meta] of [...classFirst.entries()].sort((a, b) =>
    a[1].asOf.localeCompare(b[1].asOf),
  )) {
    coverageMarkers.push({
      asOf: meta.asOf,
      label: className,
      class: className,
      kind: 'class',
    });
  }

  const points = downsamplePoints(
    daily,
    coverageMarkers.map((marker) => marker.asOf),
  );

  const last = points[points.length - 1];
  const first = points[0];
  const headline = last?.total ?? 0;
  const change = last && first ? roundMoney(last.total - first.total) : 0;
  const changePct =
    last && first && first.total !== 0 ? last.total / first.total - 1 : null;

  const byClass = last?.byClass ?? {};
  let assets = 0;
  let liabilities = 0;
  for (const [className, amount] of Object.entries(byClass)) {
    if (className === 'credit' || className === 'liability' || amount < 0) {
      liabilities += amount;
    } else {
      assets += amount;
    }
  }

  return {
    range,
    asOf,
    headline,
    change,
    changePct,
    assets: roundMoney(assets),
    liabilities: roundMoney(liabilities),
    byClass,
    points,
    coverageMarkers,
    accounts,
    grain: grainForRange(range),
    rollup: 'raw',
  };
}

/**
 * Narrows a wider page model (e.g. All) to `range`, recomputing the change.
 * Lets a client offer a range before the backend that validates it is live.
 */
export function trimModelToRange(model: NetWorthPageModel, range: RangeKey): NetWorthPageModel {
  const earliest = model.points[0]?.asOf ?? null;
  const { from } = rangeWindow(range, model.asOf, earliest);
  const points = model.points.filter((point) => point.asOf >= from);
  const coverageMarkers = model.coverageMarkers.filter((marker) => marker.asOf >= from);
  if (points.length === model.points.length && coverageMarkers.length === model.coverageMarkers.length) {
    return { ...model, range, grain: grainForRange(range) };
  }
  const first = points[0];
  const last = points[points.length - 1];
  return {
    ...model,
    range,
    grain: grainForRange(range),
    points,
    coverageMarkers,
    change: first && last ? roundMoney(last.total - first.total) : 0,
    changePct: first && last && first.total !== 0 ? last.total / first.total - 1 : null,
  };
}

/** Trim an All (or wider) page model to every range in one pass. */
export function modelsForRanges(model: NetWorthPageModel): Record<RangeKey, NetWorthPageModel> {
  const out = {} as Record<RangeKey, NetWorthPageModel>;
  for (const key of RANGE_KEYS) out[key] = trimModelToRange(model, key);
  return out;
}

export function todayIso(now = new Date()): string {
  return todayInTimeZone(now);
}
