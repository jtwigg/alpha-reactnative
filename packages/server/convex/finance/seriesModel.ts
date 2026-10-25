import { daysBetween, monthStart, weekStart } from './dates';
import { enclosingMonthEnds, enclosingWeekEnds } from './rollups';
import { grainForRange, type RangeKey, type RollupGrain } from './series';
import { parseAccountScope, type TwrWindow } from './twrModel';

export const SERIES_METHOD = 'finance.bench.v1' as const;

export type SeriesPoint = {
  asOf: string;
  value: number;
  netInvested: number;
  sp500Equiv: number;
  valueInterpolated: boolean;
  estimated: boolean;
};

export type SeriesScope = 'total' | 'reliable_subset' | `account:${string}`;

export function assertSeriesScope(scope: string): asserts scope is SeriesScope {
  if (scope === 'total' || scope === 'reliable_subset') return;
  if (parseAccountScope(scope)) return;
  throw new Error(`series.scope must be total, reliable_subset, or account:<id>, got ${scope}`);
}

export function assertSeriesMethod(method: string): void {
  if (method !== SERIES_METHOD) throw new Error(`series.method must be ${SERIES_METHOD}`);
}

/** Unique scopes in a series upsert batch, sorted. */
export function scopesInSeriesBatch(items: Array<{ scope: string }>): string[] {
  return [...new Set(items.map((item) => item.scope))].sort();
}

/**
 * Whether this upsert_series call should delete existing rows for the batch's
 * scopes before writing. `replaceScope` only applies on the first batch of a
 * rewrite: later batches with the same `replaceBatchId` skip the delete.
 * Without a batch id, Finance must send `replaceScope: true` on the first
 * ≤500 batch only.
 */
export function shouldReplaceSeriesScope(args: {
  replaceScope?: boolean;
  replaceBatchId?: string;
  seenBatchId?: boolean;
}): boolean {
  if (!args.replaceScope) return false;
  if (args.replaceBatchId && args.seenBatchId) return false;
  return true;
}

export function sp500ReturnScope(scope: string): string {
  return scope.startsWith('sp500:') ? scope : `sp500:${scope}`;
}

export function seriesAccountId(scope: string): string | null {
  return parseAccountScope(scope);
}

/** Page range → stored TWR window, or null when we only compute from the series. */
export function twrWindowForRange(range: RangeKey): TwrWindow | null {
  if (range === '3M') return '3M';
  if (range === 'YTD') return 'YTD';
  if (range === '1Y') return '1Y';
  if (range === '5Y') return '3Y';
  if (range === 'All') return 'SI';
  return null;
}

/**
 * TWR from a flow-adjusted dollar path. A change in `netInvested` is treated
 * as an end-of-day flow and stripped before the period return is compounded.
 */
export function twrFromFlowAdjusted(
  points: Array<{ value: number; netInvested: number }>,
): number | null {
  let factor = 1;
  let steps = 0;
  for (let i = 1; i < points.length; i += 1) {
    const start = points[i - 1].value;
    if (!Number.isFinite(start) || start === 0) continue;
    const flow = points[i].netInvested - points[i - 1].netInvested;
    const endBeforeFlow = points[i].value - flow;
    if (!Number.isFinite(endBeforeFlow) || endBeforeFlow === 0) continue;
    factor *= endBeforeFlow / start;
    steps += 1;
  }
  return steps > 0 ? factor - 1 : null;
}

export function lastSeriesInBucket(
  points: SeriesPoint[],
  start: string,
  end: string,
): SeriesPoint | null {
  let found: SeriesPoint | null = null;
  for (const point of points) {
    if (point.asOf < start) continue;
    if (point.asOf > end) break;
    found = point;
  }
  return found;
}

export function coarseSeries(
  points: SeriesPoint[],
  grain: 'week' | 'month',
  from: string,
  to: string,
): SeriesPoint[] {
  const ends = grain === 'week' ? enclosingWeekEnds(from, to) : enclosingMonthEnds(from, to);
  const out: SeriesPoint[] = [];
  for (const end of ends) {
    const start = grain === 'week' ? weekStart(end) : monthStart(end);
    const hit = lastSeriesInBucket(points, start, end);
    if (!hit) continue;
    out.push({ ...hit, asOf: end });
  }
  return out;
}

export function carrySeriesForward(points: SeriesPoint[], from: string, to: string, days: string[]): SeriesPoint[] {
  if (points.length === 0) return [];
  const ordered = [...points].sort((a, b) => a.asOf.localeCompare(b.asOf));
  const out: SeriesPoint[] = [];
  let index = 0;
  let last: SeriesPoint | null = null;
  for (const day of days) {
    if (day < from || day > to) continue;
    while (index < ordered.length && ordered[index].asOf <= day) {
      last = ordered[index];
      index += 1;
    }
    if (!last) continue;
    out.push({
      ...last,
      asOf: day,
      valueInterpolated: last.valueInterpolated || last.asOf !== day,
    });
  }
  return out;
}

export function seriesGrainForRange(range: RangeKey): RollupGrain {
  return grainForRange(range);
}

export function dedupeSeriesByKey<T extends { scope: string; date: string }>(items: T[]): T[] {
  const last = new Map<string, T>();
  for (const item of items) last.set(`${item.scope}|${item.date}`, item);
  return [...last.values()];
}

export function annualizeTwr(cumulative: number, startDate: string, asOf: string): number | null {
  const days = daysBetween(startDate, asOf);
  if (days < 365 || !Number.isFinite(cumulative) || cumulative <= -1) return null;
  const years = days / 365.25;
  if (years <= 0) return null;
  return (1 + cumulative) ** (1 / years) - 1;
}

export type SeriesHeader = {
  cumulative: number;
  annualized: number | null;
  window: string | null;
  startDate: string | null;
  asOf: string | null;
  source: 'returns' | 'computed';
};

export function headerFromReturn(row: {
  cumulative: number;
  annualized?: number | null;
  window: string;
  startDate: string;
  asOf: string;
}): SeriesHeader {
  return {
    cumulative: row.cumulative,
    annualized: row.annualized ?? null,
    window: row.window,
    startDate: row.startDate,
    asOf: row.asOf,
    source: 'returns',
  };
}

/** S&P TWR is never computed from the series path — only a stored returns row. */
export function headerFromStoredSp500(stored: SeriesHeader | null): SeriesHeader | null {
  return stored?.source === 'returns' ? stored : null;
}

export function headerFromComputed(
  points: Array<{ value: number; netInvested: number; asOf: string }>,
  window: TwrWindow | null,
): SeriesHeader | null {
  const cumulative = twrFromFlowAdjusted(points);
  if (cumulative == null || points.length === 0) return null;
  const startDate = points[0].asOf;
  const asOf = points[points.length - 1].asOf;
  return {
    cumulative,
    annualized: annualizeTwr(cumulative, startDate, asOf),
    window,
    startDate,
    asOf,
    source: 'computed',
  };
}

/** Last-at-or-before carry of a dated field onto a chart date grid. */
export function alignFieldToDates(
  dates: string[],
  points: Array<{ asOf: string; value: number }>,
): Array<number | null> {
  if (dates.length === 0 || points.length === 0) return dates.map(() => null);
  const ordered = [...points].sort((a, b) => a.asOf.localeCompare(b.asOf));
  let index = 0;
  let last: number | null = null;
  return dates.map((date) => {
    while (index < ordered.length && ordered[index].asOf <= date) {
      last = ordered[index].value;
      index += 1;
    }
    return last;
  });
}

/**
 * Flow-adjusted S&P dollar path, rebased onto `startValue` so it can sit on
 * a plain balance chart as a like-for-like overlay.
 */
export function flowAdjustedOverlay(
  dates: string[],
  startValue: number,
  points: Array<{ asOf: string; sp500Equiv: number }>,
): Array<number | null> {
  const raw = alignFieldToDates(
    dates,
    points.map((point) => ({ asOf: point.asOf, value: point.sp500Equiv })),
  );
  const first = raw.find((value) => value != null);
  if (first == null || first === 0 || !Number.isFinite(startValue)) return raw;
  return raw.map((value) => (value == null ? null : (startValue * value) / first));
}

export function seriesPointFromDoc(row: {
  date?: string;
  asOf?: string;
  value: number;
  netInvested?: number;
  sp500Equiv?: number;
  valueInterpolated?: boolean;
  interpolated?: boolean;
  estimated?: boolean;
}): SeriesPoint {
  return {
    asOf: row.asOf ?? row.date ?? '',
    value: row.value,
    netInvested: row.netInvested ?? 0,
    sp500Equiv: row.sp500Equiv ?? 0,
    valueInterpolated: row.valueInterpolated ?? row.interpolated ?? false,
    estimated: row.estimated ?? false,
  };
}
