import { describe, expect, it } from 'vitest';
import {
  accountValueOnDay,
  buildNetWorthModel,
  rangeWindow,
  signedAmount,
} from '../convex/finance/series';

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
    const onJoin = model.points.find((point) => point.asOf === '2026-08-01');
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
