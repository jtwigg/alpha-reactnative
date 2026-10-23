import { spanInDays } from './chart-math';

/** Two chart indices; `a` is always the earlier one. */
export type ComparePair = { a: number; b: number };

export type CompareStat = {
  from: number;
  to: number;
  delta: number;
  /** Relative to |from|, so a shrinking loan reads as a negative % of its balance. */
  pct: number | null;
  /** Compound annual rate; only for spans over a year with a positive start. */
  annualized: number | null;
};

export type SeriesDelta = {
  key: string;
  label: string;
  color: string;
  from: number | null;
  to: number | null;
  delta: number;
  pct: number | null;
  /** Share of the base total's change, in fractional points (delta / |base start|). */
  contribution: number | null;
};

const DAYS_PER_YEAR = 365.25;

export function orderPair(x: number, y: number): ComparePair {
  return x <= y ? { a: x, b: y } : { a: y, b: x };
}

export function pctChange(from: number, to: number): number | null {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0) return null;
  return (to - from) / Math.abs(from);
}

/** Annualize a total return over `days`. Only spans over one year are annualized. */
export function annualizedReturn(from: number, to: number, days: number): number | null {
  if (days <= 365 || from <= 0 || to <= 0) return null;
  return Math.pow(to / from, DAYS_PER_YEAR / days) - 1;
}

export function compareStat(from: number, to: number, days: number): CompareStat {
  return {
    from,
    to,
    delta: to - from,
    pct: pctChange(from, to),
    annualized: annualizedReturn(from, to, days),
  };
}

export function compareDays(dates: string[], pair: ComparePair): number {
  const from = dates[pair.a];
  const to = dates[pair.b];
  return from && to ? spanInDays(from, to) : 0;
}

/** Stat for one series between the pair, or null if either end has no value. */
export function compareSeries(values: (number | null)[], dates: string[], pair: ComparePair): CompareStat | null {
  const from = values[pair.a];
  const to = values[pair.b];
  if (from == null || to == null) return null;
  return compareStat(from, to, compareDays(dates, pair));
}

/**
 * Per-series change between the pair, largest absolute change first. Missing
 * values count as zero (an account that did not exist yet contributed its whole
 * balance). `baseFrom` is the total the contributions are measured against.
 */
export function seriesDeltas(
  series: { key: string; label: string; color: string; values: (number | null)[] }[],
  pair: ComparePair,
  baseFrom: number,
): SeriesDelta[] {
  return series
    .map((s) => {
      const from = s.values[pair.a] ?? null;
      const to = s.values[pair.b] ?? null;
      const delta = (to ?? 0) - (from ?? 0);
      return {
        key: s.key,
        label: s.label,
        color: s.color,
        from,
        to,
        delta,
        pct: from == null || to == null ? null : pctChange(from, to),
        contribution: baseFrom === 0 ? null : delta / Math.abs(baseFrom),
      };
    })
    .filter((row) => row.from != null || row.to != null)
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || x.label.localeCompare(y.label));
}

export function formatSpan(days: number): string {
  if (days <= 0) return 'same day';
  if (days === 1) return '1 day';
  if (days <= 90) return `${days} days`;
  if (days < 730) return `${Math.round(days / 30.44)} months`;
  return `${(days / DAYS_PER_YEAR).toFixed(1)} years`;
}

/** Which pinned handle a touch at `x` grabs, if any. */
export function nearestHandle(x: number, handles: { a: number; b: number }, hitPx: number): 'a' | 'b' | null {
  const da = Math.abs(x - handles.a);
  const db = Math.abs(x - handles.b);
  if (Math.min(da, db) > hitPx) return null;
  return da <= db ? 'a' : 'b';
}
