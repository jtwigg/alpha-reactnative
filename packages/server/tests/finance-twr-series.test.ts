import { describe, expect, it } from 'vitest';
import { canonicalizeFinanceRow, financeContentHash, bucketHash } from '../convex/finance/hash';
import {
  annualizeTwr,
  assertSeriesScope,
  carrySeriesForward,
  coarseSeries,
  dedupeSeriesByKey,
  headerFromComputed,
  seriesPointFromDoc,
  sp500ReturnScope,
  twrFromFlowAdjusted,
  twrWindowForRange,
} from '../convex/finance/seriesModel';
import { assertReturnScope } from '../convex/finance/twrModel';

const SERIES = {
  scope: 'reliable_subset',
  date: '2026-10-23',
  value: 125000.5,
  netInvested: 100000,
  sp500Equiv: 118250.25,
  valueInterpolated: false,
  estimated: true,
};

const SERIES_CANONICAL = [
  'finance.v1',
  'series',
  'scope=reliable_subset',
  'date=2026-10-23',
  'value=125000.50000000',
  'netInvested=100000.00000000',
  'sp500Equiv=118250.25000000',
  'valueInterpolated=false',
  'estimated=true',
].join('\n');

describe('series scopes and windows', () => {
  it('accepts the same scopes as returns, plus sp500:<inner> on returns', () => {
    assertSeriesScope('total');
    assertSeriesScope('reliable_subset');
    assertSeriesScope('account:acc_1');
    expect(() => assertSeriesScope('sp500:total')).toThrow(/account:<id>/);
    assertReturnScope('sp500:total');
    assertReturnScope('sp500:account:acc_1');
    expect(sp500ReturnScope('reliable_subset')).toBe('sp500:reliable_subset');
    expect(twrWindowForRange('3M')).toBe('3M');
    expect(twrWindowForRange('YTD')).toBe('YTD');
    expect(twrWindowForRange('1Y')).toBe('1Y');
    expect(twrWindowForRange('5Y')).toBe('3Y');
    expect(twrWindowForRange('All')).toBe('SI');
    expect(twrWindowForRange('1M')).toBeNull();
  });

  it('last-wins on scope+date', () => {
    const kept = dedupeSeriesByKey([
      { scope: 'total', date: '2026-10-01', value: 1 },
      { scope: 'total', date: '2026-10-01', value: 2 },
      { scope: 'total', date: '2026-10-02', value: 3 },
    ]);
    expect(kept).toHaveLength(2);
    expect(kept.find((row) => row.date === '2026-10-01')?.value).toBe(2);
  });
});

describe('TWR from a flow-adjusted path', () => {
  it('strips end-of-day netInvested changes before compounding', () => {
    const twr = twrFromFlowAdjusted([
      { value: 100, netInvested: 100 },
      { value: 110, netInvested: 100 },
      { value: 160, netInvested: 150 },
    ]);
    expect(twr).toBeCloseTo(0.1, 8);
  });

  it('computes a header and annualizes only after a year', () => {
    const header = headerFromComputed(
      [
        { value: 100, netInvested: 100, asOf: '2025-10-23' },
        { value: 110, netInvested: 100, asOf: '2026-10-23' },
      ],
      '1Y',
    );
    expect(header?.source).toBe('computed');
    expect(header?.cumulative).toBeCloseTo(0.1, 8);
    expect(header?.annualized).not.toBeNull();
    expect(annualizeTwr(0.1, '2026-09-01', '2026-10-23')).toBeNull();
  });
});

describe('series rollup helpers', () => {
  it('carries the last point forward and marks interpolated days', () => {
    const carried = carrySeriesForward(
      [
        {
          asOf: '2026-10-01',
          value: 10,
          netInvested: 8,
          sp500Equiv: 9,
          valueInterpolated: false,
          estimated: true,
        },
      ],
      '2026-10-01',
      '2026-10-03',
      ['2026-10-01', '2026-10-02', '2026-10-03'],
    );
    expect(carried).toHaveLength(3);
    expect(carried[0].valueInterpolated).toBe(false);
    expect(carried[1].valueInterpolated).toBe(true);
    expect(carried[2].netInvested).toBe(8);
    expect(carried[2].estimated).toBe(true);
  });

  it('keeps the last point in each week/month bucket', () => {
    const points = [
      seriesPointFromDoc({ date: '2026-10-01', value: 1, netInvested: 1, sp500Equiv: 1 }),
      seriesPointFromDoc({ date: '2026-10-15', value: 2, netInvested: 1, sp500Equiv: 1.1 }),
      seriesPointFromDoc({ date: '2026-10-31', value: 3, netInvested: 2, sp500Equiv: 1.2 }),
    ];
    const months = coarseSeries(points, 'month', '2026-10-01', '2026-10-31');
    expect(months).toEqual([
      expect.objectContaining({ asOf: '2026-10-31', value: 3, netInvested: 2 }),
    ]);
  });
});

describe('finance.v1 series hash', () => {
  it('canonicalizes declared fields including flags', () => {
    expect(canonicalizeFinanceRow('series', SERIES)).toBe(SERIES_CANONICAL);
  });

  it('checksums with the same bucketHash method as flows/returns', async () => {
    const hash = await financeContentHash('series', SERIES);
    expect(hash).toHaveLength(64);
    expect(await bucketHash([hash])).toBe(hash);
  });
});
