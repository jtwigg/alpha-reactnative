import { RANGE_KEYS, grainForRange, rangeWindow, type ChartPoint, type RangeKey } from './series';
import type { SeriesPoint } from './seriesModel';
import { SPARKLINE_POINTS } from './accountModel';

export const SERVE_KINDS = ['page', 'account', 'sparklines', 'stack', 'series'] as const;
export type ServeKind = (typeof SERVE_KINDS)[number];

export const SERVE_PAGE_SCOPE = 'net';
export const SERVE_SPARK_SCOPE = 'all';
export const SERVE_STACK_SCOPE = 'overview';

/** posh-mink-581 live topology (2026-10-25): 27 accounts, first coverage 2014-03-07. */
export const LIVE_ACCOUNT_COUNT = 27;
export const LIVE_FIRST_AS_OF = '2014-03-07';
export const LIVE_AS_OF = '2026-10-24';

export type ColumnarPoints = {
  dates: string[];
  totals: number[];
  interpolated: number[];
  classKeys: string[];
  classCols: number[][];
};

export type ColumnarSeries = {
  dates: string[];
  value: number[];
  netInvested: number[];
  sp500Equiv: number[];
  valueInterpolated: number[];
  estimated: number[];
};

export type ColumnarCoverage = {
  asOf: string[];
  label: string[];
  className: string[];
};

export type ServePageRange = {
  headline: number;
  change: number;
  changePct: number | null;
  assets: number;
  liabilities: number;
  byClass: Record<string, number>;
  grain: 'day' | 'week' | 'month';
  points: ColumnarPoints;
  coverage: ColumnarCoverage;
};

export type ServeAccountRange = {
  change: number;
  changePct: number | null;
  firstAsOf: string | null;
  grain: 'day' | 'week' | 'month';
  points: ColumnarPoints;
};

export type ServeSparkRange = {
  dates: string[];
  ids: string[];
  values: Array<Array<number | null>>;
  groupKeys: string[];
  groupValues: Array<Array<number | null>>;
};

export type ServeStackRange = {
  from: string;
  to: string;
  step: 'day' | 'week';
  firstAsOf: string | null;
  dates: string[];
  ids: string[];
  names: string[];
  classes: string[];
  groups: string[];
  values: Array<Array<number | null>>;
};

export type ServeSeriesRange = {
  grain: 'day' | 'week' | 'month';
  points: ColumnarSeries;
  twr: {
    cumulative: number;
    annualized: number | null;
    window: string | null;
    startDate: string | null;
    asOf: string | null;
    source: 'returns' | 'computed';
  } | null;
  sp500Twr: {
    cumulative: number;
    annualized: number | null;
    window: string | null;
    startDate: string | null;
    asOf: string | null;
    source: 'returns' | 'computed';
  } | null;
};

export function encodePoints(points: ChartPoint[]): ColumnarPoints {
  const classKeys = [...new Set(points.flatMap((point) => Object.keys(point.byClass)))].sort();
  return {
    dates: points.map((point) => point.asOf),
    totals: points.map((point) => point.total),
    interpolated: points.map((point) => (point.interpolated ? 1 : 0)),
    classKeys,
    classCols: classKeys.map((key) => points.map((point) => point.byClass[key] ?? 0)),
  };
}

export function decodePoints(col: ColumnarPoints): ChartPoint[] {
  return col.dates.map((asOf, index) => {
    const byClass: Record<string, number> = {};
    col.classKeys.forEach((key, keyIndex) => {
      byClass[key] = col.classCols[keyIndex]?.[index] ?? 0;
    });
    return {
      asOf,
      total: col.totals[index] ?? 0,
      interpolated: Boolean(col.interpolated[index]),
      byClass,
    };
  });
}

export function encodeSeriesPoints(points: SeriesPoint[]): ColumnarSeries {
  return {
    dates: points.map((point) => point.asOf),
    value: points.map((point) => point.value),
    netInvested: points.map((point) => point.netInvested),
    sp500Equiv: points.map((point) => point.sp500Equiv),
    valueInterpolated: points.map((point) => (point.valueInterpolated ? 1 : 0)),
    estimated: points.map((point) => (point.estimated ? 1 : 0)),
  };
}

export function decodeSeriesPoints(col: ColumnarSeries): SeriesPoint[] {
  return col.dates.map((asOf, index) => ({
    asOf,
    value: col.value[index] ?? 0,
    netInvested: col.netInvested[index] ?? 0,
    sp500Equiv: col.sp500Equiv[index] ?? 0,
    valueInterpolated: Boolean(col.valueInterpolated[index]),
    estimated: Boolean(col.estimated[index]),
  }));
}

export function encodeCoverage(
  markers: Array<{ asOf: string; label: string; class: string }>,
): ColumnarCoverage {
  return {
    asOf: markers.map((marker) => marker.asOf),
    label: markers.map((marker) => marker.label),
    className: markers.map((marker) => marker.class),
  };
}

export function decodeCoverage(col: ColumnarCoverage): Array<{
  asOf: string;
  label: string;
  class: string;
  kind: 'class';
}> {
  return col.asOf.map((asOf, index) => ({
    asOf,
    label: col.label[index] ?? '',
    class: col.className[index] ?? '',
    kind: 'class' as const,
  }));
}

export function stringifyPayload(value: unknown): string {
  return JSON.stringify(value);
}

export function parsePayload<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

export function payloadBytes(value: unknown): number {
  return new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value)).length;
}

export function rangeDays(range: RangeKey, asOf = LIVE_AS_OF, firstAsOf = LIVE_FIRST_AS_OF): number {
  const window = rangeWindow(range, asOf, firstAsOf);
  const start = new Date(`${window.from}T00:00:00Z`).getTime();
  const end = new Date(`${window.to}T00:00:00Z`).getTime();
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

export function rangePointCount(range: RangeKey, asOf = LIVE_AS_OF, firstAsOf = LIVE_FIRST_AS_OF): number {
  const days = rangeDays(range, asOf, firstAsOf);
  const grain = grainForRange(range);
  if (grain === 'day') return days;
  if (grain === 'week') return Math.ceil(days / 7);
  return Math.ceil(days / 30.4);
}

/**
 * Documents the current (pre-serve) read set on posh-mink-581.
 * page: accounts + 2 end probes + state + total rollup rows.
 * sparklines/stack/detail: per-account rollup scan at the range grain.
 */
export function currentQueryCost(args: {
  query: 'page' | 'sparklines' | 'detail' | 'series' | 'stack';
  range: RangeKey;
  accounts?: number;
  asOf?: string;
  firstAsOf?: string;
}): { documentsRead: number; pointCount: number; note: string } {
  const accounts = args.accounts ?? LIVE_ACCOUNT_COUNT;
  const points = rangePointCount(args.range, args.asOf, args.firstAsOf);
  if (args.query === 'page') {
    return {
      documentsRead: accounts + accounts * 2 + 1 + points,
      pointCount: points,
      note: 'accounts + 2 ends/account + state + total rollup rows',
    };
  }
  if (args.query === 'sparklines' || args.query === 'stack') {
    return {
      documentsRead: accounts + accounts * 2 + 1 + accounts * points,
      pointCount: args.query === 'sparklines' ? SPARKLINE_POINTS : points,
      note: 'accounts + ends + state + per-account rollup range',
    };
  }
  if (args.query === 'detail') {
    return {
      documentsRead: 1 + 2 + 1 + points,
      pointCount: points,
      note: 'account + ends + state + account rollup range',
    };
  }
  return {
    documentsRead: 2 + 1 + points + 1,
    pointCount: points,
    note: 'series first/last + state + series rollup + returns page',
  };
}

export function serveQueryCost(query: 'page' | 'sparklines' | 'detail' | 'series' | 'stack' | 'pack'): {
  documentsRead: number;
  note: string;
} {
  if (query === 'pack') {
    return { documentsRead: RANGE_KEYS.length, note: 'one serve doc per range, no computation' };
  }
  return { documentsRead: 1, note: 'single indexed get of finance_serve' };
}

export function sameNumbers(left: number[], right: number[], eps = 0.02): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (Math.abs((left[i] ?? 0) - (right[i] ?? 0)) > eps) return false;
  }
  return true;
}

export function rangesOverlapping(from: string, asOf: string, firstAsOf: string): RangeKey[] {
  return RANGE_KEYS.filter((range) => rangeWindow(range, asOf, firstAsOf).from <= from || range === 'All');
}
