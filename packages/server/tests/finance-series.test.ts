import { describe, expect, it } from 'vitest';
import {
  accountValueOnDay,
  buildNetWorthModel,
  chartStep,
  modelsForRanges,
  rangeWindow,
  signedAmount,
  trimModelToRange,
} from '../convex/finance/series';
import { accountHistory, sparklineRows, trimHistoryToRange, trimSparklinesToRange } from '../convex/finance/accountModel';

describe('accountValueOnDay', () => {
  const snaps = [
    { asOf: '2026-07-31', balance: 100, source: 'observed' as const },
    { asOf: '2026-08-03', balance: 400, source: 'observed' as const },
  ];

  it('returns null before the first point (never 0)', () => {
    expect(
      accountValueOnDay(snaps, '2026-07-30', { balance: 400, asOf: '2026-10-23' }),
    ).toBeNull();
  });

  it('interpolates the open gap', () => {
    const mid = accountValueOnDay(snaps, '2026-08-01', {
      balance: 400,
      asOf: '2026-10-23',
    });
    expect(mid).toMatchObject({ interpolated: true, source: 'interpolated' });
    expect(mid?.balance).toBeCloseTo(200, 8);
  });

  it('holds the last value flat after coverage (not interpolated)', () => {
    expect(
      accountValueOnDay(snaps, '2026-08-10', { balance: 999, asOf: '2026-10-23' }),
    ).toEqual({ balance: 400, source: 'observed', interpolated: false });
  });

  it('does not invent a UTC-today point when an account has no snapshots', () => {
    expect(
      accountValueOnDay([], '2026-10-23', { balance: 50_000, asOf: '2026-10-23' }),
    ).toBeNull();
  });
});

describe('buildNetWorthModel', () => {
  it('excludes an account from totals before its first snapshot', () => {
    const model = buildNetWorthModel({
      range: 'All',
      asOf: '2026-08-05',
      accounts: [
        {
          sourceId: 'home',
          name: 'House',
          class: 'real_estate',
          provider: 'manual',
          currentBalance: 500,
          syncedAt: 1,
        },
        {
          sourceId: 'broker',
          name: 'Brokerage',
          class: 'investments',
          provider: 'plaid',
          currentBalance: 200,
          syncedAt: 1,
        },
      ],
      snapshots: [
        { accountId: 'home', asOf: '2026-07-01', balance: 500, source: 'manual' },
        { accountId: 'broker', asOf: '2026-08-01', balance: 200, source: 'observed' },
      ],
    });

    const before = model.points.find((point) => point.asOf === '2026-07-15');
    const onJoin = model.points.find((point) => point.asOf === '2026-08-05');
    expect(before?.total).toBe(500);
    expect(before?.byClass.investments).toBeUndefined();
    expect(onJoin?.total).toBe(700);
    expect(model.coverageMarkers.some((marker) => marker.asOf === '2026-08-01')).toBe(
      true,
    );
  });

  it('does not invent a 0→value step on a late-start series', () => {
    const late = accountValueOnDay(
      [{ asOf: '2026-10-12', balance: 80_000, source: 'observed' }],
      '2026-10-11',
      { balance: 80_000, asOf: '2026-10-23' },
    );
    expect(late).toBeNull();
    expect(signedAmount('liability', 100)).toBe(-100);
    expect(rangeWindow('1M', '2026-10-23', '2019-06-01')).toEqual({
      from: '2026-09-23',
      to: '2026-10-23',
    });
  });
});

describe('5Y range', () => {
  it('spans five years weekly, clamped to the first data point', () => {
    expect(rangeWindow('5Y', '2026-10-23', '2019-06-01')).toEqual({ from: '2021-10-23', to: '2026-10-23' });
    expect(rangeWindow('5Y', '2026-10-23', '2024-02-01')).toEqual({ from: '2024-02-01', to: '2026-10-23' });
    expect(chartStep('5Y')).toBe('week');
  });

  it('trims an All model to 5Y and recomputes the change', () => {
    const model = buildNetWorthModel({
      range: 'All',
      asOf: '2026-10-23',
      accounts: [
        { sourceId: 'cash', name: 'Cash', class: 'cash', provider: 'manual', currentBalance: 300, syncedAt: 1 },
      ],
      snapshots: [
        { accountId: 'cash', asOf: '2018-01-01', balance: 100, source: 'manual' },
        { accountId: 'cash', asOf: '2021-10-25', balance: 200, source: 'manual' },
        { accountId: 'cash', asOf: '2026-10-23', balance: 300, source: 'manual' },
      ],
    });
    const trimmed = trimModelToRange(model, '5Y');
    expect(trimmed.range).toBe('5Y');
    expect(trimmed.points[0].asOf >= '2021-10-23').toBe(true);
    expect(trimmed.points.length).toBeLessThan(model.points.length);
    expect(trimmed.headline).toBe(model.headline);
    const first = trimmed.points[0].total;
    expect(trimmed.change).toBeCloseTo(300 - first, 2);
    expect(trimmed.changePct).toBeCloseTo(300 / first - 1, 9);
    expect(trimModelToRange(model, 'All').points).toHaveLength(model.points.length);
  });

  it('precomputes every range from one All model without another read', () => {
    const model = buildNetWorthModel({
      range: 'All',
      asOf: '2026-10-23',
      accounts: [
        { sourceId: 'cash', name: 'Cash', class: 'cash', provider: 'manual', currentBalance: 300, syncedAt: 1 },
      ],
      snapshots: [
        { accountId: 'cash', asOf: '2018-01-01', balance: 100, source: 'manual' },
        { accountId: 'cash', asOf: '2026-09-23', balance: 250, source: 'manual' },
        { accountId: 'cash', asOf: '2026-10-23', balance: 300, source: 'manual' },
      ],
    });
    const byRange = modelsForRanges(model);
    expect(byRange.All.points).toHaveLength(model.points.length);
    expect(byRange['1M'].points[0].asOf >= '2026-09-23').toBe(true);
    expect(byRange['1M'].points.length).toBeLessThan(byRange.All.points.length);
    const monthStart = byRange['1M'].points[0].total;
    expect(byRange['1M'].change).toBeCloseTo(300 - monthStart, 2);
    expect(byRange['1Y'].range).toBe('1Y');
  });
});

describe('trim history and sparklines', () => {
  const account = {
    sourceId: 'wf',
    provider: 'manual',
    class: 'investments',
    name: 'Wealthfront',
    type: 'investment',
    currentBalance: 300,
    currency: 'USD',
    syncedAt: 1,
  };
  const snapshots = [
    { accountId: 'wf', asOf: '2018-01-01', balance: 100, source: 'manual' as const },
    { accountId: 'wf', asOf: '2026-09-23', balance: 250, source: 'manual' as const },
    { accountId: 'wf', asOf: '2026-10-23', balance: 300, source: 'manual' as const },
  ];

  it('trims an All account history to 1M and rebases the change', () => {
    const all = accountHistory({ account, snapshots, range: 'All', asOf: '2026-10-23' });
    const month = trimHistoryToRange(all, '1M');
    expect(month.range).toBe('1M');
    expect(month.points[0].asOf >= '2026-09-23').toBe(true);
    expect(month.change).toBeCloseTo(300 - month.points[0].total, 2);
    expect(trimHistoryToRange(all, 'All').points).toHaveLength(all.points.length);
  });

  it('trims All-range sparks without another derivation of the full grid', () => {
    const dates = ['2018-01-01', '2026-09-23', '2026-10-23'];
    const rows = sparklineRows({ accounts: [account], snapshots, dates });
    const all = {
      range: 'All' as const,
      asOf: '2026-10-23',
      dates,
      rows: rows.map((row) => ({ ...row, weighted: { change: row.change, pct: row.changePct, tone: row.tone } })),
      groups: [],
    };
    const month = trimSparklinesToRange(all, '1M', [account]);
    expect(month.dates[0] >= '2026-09-23').toBe(true);
    expect(month.rows[0].values).toHaveLength(month.dates.length);
    expect(month.rows[0].change).toBeCloseTo(50, 2);
  });
});
