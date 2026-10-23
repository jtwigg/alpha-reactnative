import { describe, expect, it } from 'vitest';
import {
  annualizedReturn,
  compareDays,
  compareSeries,
  compareStat,
  formatSpan,
  nearestHandle,
  orderPair,
  pctChange,
  seriesDeltas,
} from '../../reactnative/lib/compare-math';

describe('A/B compare deltas', () => {
  it('orders the pair so A is the earlier point', () => {
    expect(orderPair(7, 2)).toEqual({ a: 2, b: 7 });
    expect(orderPair(2, 7)).toEqual({ a: 2, b: 7 });
    expect(orderPair(4, 4)).toEqual({ a: 4, b: 4 });
  });

  it('computes $ and % change', () => {
    const stat = compareStat(100_000, 125_000, 200);
    expect(stat.delta).toBe(25_000);
    expect(stat.pct).toBeCloseTo(0.25);
    expect(stat.annualized).toBeNull();
  });

  it('measures % against |start| so negative balances read sensibly', () => {
    // Net worth climbing from −$50k to −$40k is a 20% improvement.
    expect(pctChange(-50_000, -40_000)).toBeCloseTo(0.2);
    expect(pctChange(0, 10)).toBeNull();
  });

  it('annualizes only spans longer than a year', () => {
    expect(annualizedReturn(100, 121, 365)).toBeNull();
    // Doubling over two years ≈ 41.4%/yr.
    expect(annualizedReturn(100, 200, Math.round(2 * 365.25))).toBeCloseTo(Math.SQRT2 - 1, 3);
    // Losses annualize too.
    expect(annualizedReturn(100, 81, Math.round(2 * 365.25))).toBeCloseTo(-0.1, 3);
    // Undefined when the start is not positive.
    expect(annualizedReturn(-100, 50, 900)).toBeNull();
    expect(annualizedReturn(100, 0, 900)).toBeNull();
  });

  it('uses calendar days between the two dates', () => {
    const dates = ['2023-01-01', '2024-01-01', '2025-07-02'];
    expect(compareDays(dates, { a: 0, b: 1 })).toBe(365);
    expect(compareDays(dates, { a: 0, b: 2 })).toBe(913);
    const stat = compareSeries([100, 110, 150], dates, { a: 0, b: 2 })!;
    expect(stat.pct).toBeCloseTo(0.5);
    expect(stat.annualized).toBeCloseTo(Math.pow(1.5, 365.25 / 913) - 1, 6);
  });

  it('returns null when either end has no value', () => {
    expect(compareSeries([null, 5], ['2024-01-01', '2024-02-01'], { a: 0, b: 1 })).toBeNull();
  });

  it('works for a benchmark line rebased to a different start', () => {
    const dates = ['2024-01-01', '2024-06-01', '2025-01-01'];
    const spx = [null, 4800, 5280];
    expect(compareSeries(spx, dates, { a: 1, b: 2 })!.pct).toBeCloseTo(0.1);
  });
});

describe('per-series deltas', () => {
  const series = [
    { key: 'cash', label: 'Cash', color: '#1', values: [10_000, 12_000] },
    { key: 'inv', label: 'Investments', color: '#2', values: [50_000, 80_000] },
    { key: 'loan', label: 'Loans', color: '#3', values: [-20_000, -15_000] },
    { key: 'new', label: 'New account', color: '#4', values: [null, 3_000] },
    { key: 'gone', label: 'Never', color: '#5', values: [null, null] },
  ];
  const pair = { a: 0, b: 1 };
  const base = 40_000;
  const rows = seriesDeltas(series, pair, base);

  it('sorts by largest absolute change', () => {
    expect(rows.map((row) => row.key)).toEqual(['inv', 'loan', 'new', 'cash']);
  });

  it('contributions sum to the total % change', () => {
    const end = 12_000 + 80_000 - 15_000 + 3_000;
    const sum = rows.reduce((acc, row) => acc + (row.contribution ?? 0), 0);
    expect(sum).toBeCloseTo((end - base) / base);
  });

  it('a paid-down loan counts as a positive contribution', () => {
    const loan = rows.find((row) => row.key === 'loan')!;
    expect(loan.delta).toBe(5_000);
    expect(loan.contribution).toBeCloseTo(0.125);
  });

  it('an account that appears mid-span contributes its whole balance', () => {
    const fresh = rows.find((row) => row.key === 'new')!;
    expect(fresh.delta).toBe(3_000);
    expect(fresh.pct).toBeNull();
  });

  it('drops series with no data at either point', () => {
    expect(rows.some((row) => row.key === 'gone')).toBe(false);
  });

  it('contribution is null against a zero base', () => {
    expect(seriesDeltas(series, pair, 0)[0].contribution).toBeNull();
  });
});

describe('compare handles and labels', () => {
  it('grabs the nearest pinned crosshair within the hit slop', () => {
    expect(nearestHandle(105, { a: 100, b: 200 }, 22)).toBe('a');
    expect(nearestHandle(190, { a: 100, b: 200 }, 22)).toBe('b');
    expect(nearestHandle(150, { a: 100, b: 200 }, 22)).toBeNull();
    expect(nearestHandle(100, { a: 100, b: 100 }, 22)).toBe('a');
  });

  it('formats spans', () => {
    expect(formatSpan(0)).toBe('same day');
    expect(formatSpan(1)).toBe('1 day');
    expect(formatSpan(45)).toBe('45 days');
    expect(formatSpan(365)).toBe('12 months');
    expect(formatSpan(913)).toBe('2.5 years');
  });
});
