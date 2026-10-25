import {
  decodeCoverage,
  decodePoints,
  decodeSeriesPoints,
  isColumnarPoints,
  isColumnarSeries,
} from '../../server/convex/finance/serve';
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

export type PagePackSparkRow = {
  sourceId: string;
  values: Array<number | null>;
  change: number;
  changePct: number | null;
  tone: 'good' | 'bad' | 'flat';
  weighted: { change: number; pct: number | null; tone: 'good' | 'bad' | 'flat' };
};

export type PagePackSparkGroup = {
  key: 'cash' | 'investments' | 'real_estate' | 'liability' | 'other';
  values: Array<number | null>;
  change: number;
  changePct: number | null;
  tone: 'good' | 'bad' | 'flat';
  weighted: { change: number; pct: number | null; tone: 'good' | 'bad' | 'flat' };
};

export type PagePackSpark = {
  dates: string[];
  rows: PagePackSparkRow[];
  groups: PagePackSparkGroup[];
};

export type PagePack = {
  asOf: string;
  version: number;
  accounts: unknown[];
  ranges: Record<string, PagePackRange>;
  sparks?: Record<string, PagePackSpark>;
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

/** Only the requested range — never silently substitute All. */
export function pageFromPack(pack: PagePack | null | undefined, range: RangeKey) {
  try {
    if (!pack || typeof pack !== 'object') return null;
    const row = pack.ranges?.[range];
    if (!row || !isColumnarPoints(row.points)) return null;
    const points = decodePoints(row.points);
    if (points.length === 0) return null;
    return {
      range,
      asOf: typeof pack.asOf === 'string' ? pack.asOf : points.at(-1)?.asOf ?? '',
      headline: row.headline ?? 0,
      change: row.change ?? 0,
      changePct: row.changePct ?? null,
      assets: row.assets ?? 0,
      liabilities: row.liabilities ?? 0,
      byClass: row.byClass ?? {},
      points,
      coverageMarkers: decodeCoverage(row.coverage),
      accounts: Array.isArray(pack.accounts) ? pack.accounts : [],
      grain: row.grain ?? 'day',
      rollup: row.rollup ?? 'stale',
    };
  } catch {
    return null;
  }
}

export function sparksFromPack(pack: PagePack | null | undefined, range: RangeKey): PagePackSpark | null {
  try {
    const row = pack?.sparks?.[range];
    if (!row || !Array.isArray(row.dates) || !Array.isArray(row.rows)) return null;
    return {
      dates: row.dates,
      rows: row.rows,
      groups: Array.isArray(row.groups) ? row.groups : [],
    };
  } catch {
    return null;
  }
}

export function seriesFromPack(
  pack: SeriesPack | null | undefined,
  range: RangeKey,
): {
  scope: string;
  range: RangeKey;
  asOf: string;
  grain: 'day' | 'week' | 'month';
  rollup: 'live' | 'stale' | 'raw';
  points: SeriesPoint[];
  twr: SeriesPackRange['twr'];
  sp500Twr: SeriesPackRange['sp500Twr'];
} | null {
  try {
    if (!pack || typeof pack !== 'object') return null;
    const row = pack.ranges?.[range];
    if (!row || !isColumnarSeries(row.points)) return null;
    return {
      scope: pack.scope,
      range,
      asOf: typeof pack.asOf === 'string' ? pack.asOf : '',
      grain: row.grain ?? 'day',
      rollup: row.rollup ?? 'stale',
      points: decodeSeriesPoints(row.points),
      twr: row.twr ?? null,
      sp500Twr: row.sp500Twr ?? null,
    };
  } catch {
    return null;
  }
}
