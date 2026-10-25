import { decodeCoverage, decodePoints, decodeSeriesPoints } from '../../server/convex/finance/serve';
import type { RangeKey } from '../../server/convex/finance/series';
import type { SeriesPoint } from '../../server/convex/finance/seriesModel';

export type PagePackRange = {
  headline: number;
  change: number;
  changePct: number | null;
  assets: number;
  liabilities: number;
  byClass: Record<string, number>;
  grain: 'day' | 'week' | 'month';
  rollup: 'live' | 'stale' | 'raw';
  points: {
    dates: string[];
    totals: number[];
    interpolated: number[];
    classKeys: string[];
    classCols: number[][];
  };
  coverage: { asOf: string[]; label: string[]; className: string[] };
};

export type PagePack = {
  asOf: string;
  version: number;
  accounts: unknown[];
  ranges: Record<string, PagePackRange>;
};

export type SeriesPackRange = {
  grain: 'day' | 'week' | 'month';
  rollup: 'live' | 'stale' | 'raw';
  points: {
    dates: string[];
    value: number[];
    netInvested: number[];
    sp500Equiv: number[];
    valueInterpolated: number[];
    estimated: number[];
  };
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

export type SeriesPack = {
  scope: string;
  asOf: string;
  version: number;
  ranges: Record<string, SeriesPackRange>;
};

export function pageFromPack(pack: PagePack, range: RangeKey) {
  const row = pack.ranges[range] ?? pack.ranges.All;
  if (!row) return null;
  return {
    range,
    asOf: pack.asOf,
    headline: row.headline,
    change: row.change,
    changePct: row.changePct,
    assets: row.assets,
    liabilities: row.liabilities,
    byClass: row.byClass,
    points: decodePoints(row.points),
    coverageMarkers: decodeCoverage(row.coverage),
    accounts: pack.accounts,
    grain: row.grain,
    rollup: row.rollup,
  };
}

export function seriesFromPack(pack: SeriesPack, range: RangeKey): {
  scope: string;
  range: RangeKey;
  asOf: string;
  grain: 'day' | 'week' | 'month';
  rollup: 'live' | 'stale' | 'raw';
  points: SeriesPoint[];
  twr: SeriesPackRange['twr'];
  sp500Twr: SeriesPackRange['sp500Twr'];
} | null {
  const row = pack.ranges[range] ?? pack.ranges.All;
  if (!row) return null;
  return {
    scope: pack.scope,
    range,
    asOf: pack.asOf,
    grain: row.grain,
    rollup: row.rollup,
    points: decodeSeriesPoints(row.points),
    twr: row.twr,
    sp500Twr: row.sp500Twr,
  };
}
