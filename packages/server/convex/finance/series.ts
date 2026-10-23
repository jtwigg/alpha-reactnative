import { addDays, daysBetween, eachDate, formatIsoDate, parseIsoDate } from './dates';
import { roundMoney, type SnapshotSource } from './hash';

export const RANGE_KEYS = ['1M', '3M', 'YTD', '1Y', 'All'] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

export const CHART_POINT_CAP = 160;

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
    if (day < current.asOf) return null;
    return { balance: current.balance, source: 'observed', interpolated: false };
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
  const days = eachDate(window.from, window.to);

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
  };
}

export function todayIso(now = new Date()): string {
  return formatIsoDate(now);
}
