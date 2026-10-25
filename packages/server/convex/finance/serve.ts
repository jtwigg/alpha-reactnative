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

export function isColumnarPoints(col: unknown): col is ColumnarPoints {
  if (!col || typeof col !== 'object') return false;
  const row = col as Partial<ColumnarPoints>;
  return Array.isArray(row.dates) && Array.isArray(row.totals);
}

export function decodePoints(col: ColumnarPoints | null | undefined): ChartPoint[] {
  if (!col?.dates || !Array.isArray(col.dates)) return [];
  const classKeys = Array.isArray(col.classKeys) ? col.classKeys : [];
  const classCols = Array.isArray(col.classCols) ? col.classCols : [];
  const totals = Array.isArray(col.totals) ? col.totals : [];
  const interpolated = Array.isArray(col.interpolated) ? col.interpolated : [];
  return col.dates.map((asOf, index) => {
    const byClass: Record<string, number> = {};
    classKeys.forEach((key, keyIndex) => {
      byClass[key] = classCols[keyIndex]?.[index] ?? 0;
    });
    return {
      asOf,
      total: totals[index] ?? 0,
      interpolated: Boolean(interpolated[index]),
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

export function isColumnarSeries(col: unknown): col is ColumnarSeries {
  if (!col || typeof col !== 'object') return false;
  const row = col as Partial<ColumnarSeries>;
  return Array.isArray(row.dates) && Array.isArray(row.value);
}

export function decodeSeriesPoints(col: ColumnarSeries | null | undefined): SeriesPoint[] {
  if (!col?.dates || !Array.isArray(col.dates)) return [];
  const value = Array.isArray(col.value) ? col.value : [];
  const netInvested = Array.isArray(col.netInvested) ? col.netInvested : [];
  const sp500Equiv = Array.isArray(col.sp500Equiv) ? col.sp500Equiv : [];
  const valueInterpolated = Array.isArray(col.valueInterpolated) ? col.valueInterpolated : [];
  const estimated = Array.isArray(col.estimated) ? col.estimated : [];
  return col.dates.map((asOf, index) => ({
    asOf,
    value: value[index] ?? 0,
    netInvested: netInvested[index] ?? 0,
    sp500Equiv: sp500Equiv[index] ?? 0,
    valueInterpolated: Boolean(valueInterpolated[index]),
    estimated: Boolean(estimated[index]),
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

export function decodeCoverage(col: ColumnarCoverage | null | undefined): Array<{
  asOf: string;
  label: string;
  class: string;
  kind: 'class';
}> {
  if (!col?.asOf || !Array.isArray(col.asOf)) return [];
  const label = Array.isArray(col.label) ? col.label : [];
  const className = Array.isArray(col.className) ? col.className : [];
  return col.asOf.map((asOf, index) => ({
    asOf,
    label: label[index] ?? '',
    class: className[index] ?? '',
    kind: 'class' as const,
  }));
}

const SNAPSHOT_SOURCES = new Set(['manual', 'observed', 'reconstructed', 'interpolated']);

/** Strip extra snapshot fields (e.g. accountId) so Convex object validators accept serve docs. */
export function liteSnapshot(raw: unknown): {
  asOf: string;
  balance: number;
  source: 'manual' | 'observed' | 'reconstructed' | 'interpolated';
} | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.asOf !== 'string' || typeof row.balance !== 'number' || !Number.isFinite(row.balance)) {
    return null;
  }
  const source = SNAPSHOT_SOURCES.has(String(row.source))
    ? (row.source as 'manual' | 'observed' | 'reconstructed' | 'interpolated')
    : 'observed';
  return { asOf: row.asOf, balance: row.balance, source };
}

export function sanitizePageAccounts(raw: unknown): Array<{
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
  latestSnapshot: ReturnType<typeof liteSnapshot>;
}> {
  if (!Array.isArray(raw)) return [];
  const out: ReturnType<typeof sanitizePageAccounts> = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (typeof row.sourceId !== 'string' || typeof row.name !== 'string') continue;
    if (typeof row.currentBalance !== 'number' || !Number.isFinite(row.currentBalance)) continue;
    out.push({
      sourceId: row.sourceId,
      name: row.name,
      class: typeof row.class === 'string' ? row.class : 'other',
      provider: typeof row.provider === 'string' ? row.provider : 'unknown',
      isManual: Boolean(row.isManual ?? row.provider === 'manual'),
      currentBalance: row.currentBalance,
      signedBalance: typeof row.signedBalance === 'number' ? row.signedBalance : row.currentBalance,
      currency: typeof row.currency === 'string' ? row.currency : 'USD',
      syncedAt: typeof row.syncedAt === 'number' ? row.syncedAt : 0,
      coverageStart: typeof row.coverageStart === 'string' ? row.coverageStart : undefined,
      firstAsOf: typeof row.firstAsOf === 'string' ? row.firstAsOf : null,
      latestSnapshot: liteSnapshot(row.latestSnapshot),
    });
  }
  return out;
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

export const SERVE_CHECK_REASONS = [
  'ok',
  'serve_missing',
  'live_raw',
  'no_source',
  'length',
  'value',
] as const;
export type ServeCheckReason = (typeof SERVE_CHECK_REASONS)[number];

export type NumberDiff = {
  same: boolean;
  reason: 'ok' | 'length' | 'value';
  storedLen: number;
  liveLen: number;
  firstDiffIndex?: number;
  storedValue?: number;
  liveValue?: number;
};

export function diffNumbers(left: number[], right: number[], eps = 0.02): NumberDiff {
  if (left.length !== right.length) {
    return { same: false, reason: 'length', storedLen: left.length, liveLen: right.length };
  }
  for (let i = 0; i < left.length; i += 1) {
    const storedValue = left[i] ?? 0;
    const liveValue = right[i] ?? 0;
    if (Math.abs(storedValue - liveValue) > eps) {
      return {
        same: false,
        reason: 'value',
        storedLen: left.length,
        liveLen: right.length,
        firstDiffIndex: i,
        storedValue,
        liveValue,
      };
    }
  }
  return { same: true, reason: 'ok', storedLen: left.length, liveLen: right.length };
}

export function sameNumbers(left: number[], right: number[], eps = 0.02): boolean {
  return diffNumbers(left, right, eps).same;
}

export type ServeCheckPair = {
  kind: string;
  scopeId: string;
  range: string;
  ok: boolean;
  reason: ServeCheckReason;
  storedLen?: number;
  liveLen?: number;
  firstDiffIndex?: number;
  storedAt?: string;
  liveAt?: string;
  storedValue?: number;
  liveValue?: number;
  serveVersion?: number;
  serveUpdatedAt?: number;
  serveAsOf?: string;
  liveFreshness?: string;
};

/**
 * Classify one stored-vs-live serve pair.
 * serve_missing = source exists and live can be built, but no finance_serve row.
 * live_raw = source exists but rollups/series cannot produce a comparable live path yet.
 * no_source = nothing to write (e.g. no series rows) — not a numeric mismatch.
 */
export function classifyServeCheck(args: {
  kind: string;
  scopeId: string;
  range: string;
  hasServe: boolean;
  hasSource: boolean;
  liveAvailable: boolean;
  liveFreshness?: string;
  storedValues?: number[];
  liveValues?: number[];
  storedDates?: string[];
  liveDates?: string[];
  serveVersion?: number;
  serveUpdatedAt?: number;
  serveAsOf?: string;
}): ServeCheckPair {
  const base = {
    kind: args.kind,
    scopeId: args.scopeId,
    range: args.range,
    serveVersion: args.serveVersion,
    serveUpdatedAt: args.serveUpdatedAt,
    serveAsOf: args.serveAsOf,
    liveFreshness: args.liveFreshness,
  };
  if (!args.hasServe) {
    if (!args.hasSource) return { ...base, ok: true, reason: 'no_source' };
    if (!args.liveAvailable) return { ...base, ok: false, reason: 'live_raw' };
    return { ...base, ok: false, reason: 'serve_missing' };
  }
  if (!args.liveAvailable) {
    if (!args.hasSource) return { ...base, ok: true, reason: 'no_source' };
    return { ...base, ok: false, reason: 'live_raw' };
  }
  const stored = args.storedValues ?? [];
  const live = args.liveValues ?? [];
  const diff = diffNumbers(stored, live);
  const storedAt = diff.firstDiffIndex != null ? args.storedDates?.[diff.firstDiffIndex] : undefined;
  const liveAt = diff.firstDiffIndex != null ? args.liveDates?.[diff.firstDiffIndex] : undefined;
  return {
    ...base,
    ok: diff.same,
    reason: diff.reason,
    storedLen: diff.storedLen,
    liveLen: diff.liveLen,
    firstDiffIndex: diff.firstDiffIndex,
    storedAt,
    liveAt,
    storedValue: diff.storedValue,
    liveValue: diff.liveValue,
  };
}

export function diagnosisFromPairs(
  pairs: Array<{ ok: boolean; reason: string }>,
): 'ok' | 'incomplete' | 'mismatch' | 'mixed' {
  if (pairs.every((pair) => pair.ok)) return 'ok';
  const fails = pairs.filter((pair) => !pair.ok);
  const incomplete = fails.every((pair) => pair.reason === 'serve_missing' || pair.reason === 'live_raw');
  const mismatch = fails.every((pair) => pair.reason === 'length' || pair.reason === 'value');
  if (incomplete) return 'incomplete';
  if (mismatch) return 'mismatch';
  return 'mixed';
}

export function rangesOverlapping(from: string, asOf: string, firstAsOf: string): RangeKey[] {
  return RANGE_KEYS.filter((range) => rangeWindow(range, asOf, firstAsOf).from <= from || range === 'All');
}
