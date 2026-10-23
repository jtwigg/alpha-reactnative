import { describe, expect, it } from 'vitest';
import {
  addDays,
  eachWeek,
  todayInTimeZone,
} from '../convex/finance/dates';
import { CONVEX_QUERY_READ_BUDGET } from '../convex/finance/validators';
import {
  buildNetWorthModel,
  chartDates,
  chartStep,
  loadChartSnapshots,
  memorySnapshotLookup,
  strideChartDates,
  type SeriesAccount,
  type SeriesSnapshot,
} from '../convex/finance/series';

const MAX_AS_OF = '2026-10-22';
const START = '2014-03-07';

function account(
  sourceId: string,
  className: SeriesAccount['class'],
  currentBalance: number,
): SeriesAccount {
  return {
    sourceId,
    name: sourceId,
    class: className,
    provider: 'plaid',
    currentBalance,
    syncedAt: Date.parse(`${MAX_AS_OF}T00:00:00.000Z`),
  };
}

describe('Los Angeles calendar dates', () => {
  it('does not use the UTC ISO date before midnight in LA', () => {
    const utcMorning = new Date('2026-10-23T06:00:00.000Z');
    expect(utcMorning.toISOString().slice(0, 10)).toBe('2026-10-23');
    expect(todayInTimeZone(utcMorning)).toBe('2026-10-22');
  });
});

describe('chart downsampling', () => {
  it('uses weekly points for All and daily for 1Y', () => {
    expect(chartStep('All')).toBe('week');
    expect(chartStep('1Y')).toBe('day');
    const weekly = chartDates('All', '2025-01-01', '2025-02-12');
    expect(weekly).toEqual([
      '2025-01-01',
      '2025-01-08',
      '2025-01-15',
      '2025-01-22',
      '2025-01-29',
      '2025-02-05',
      '2025-02-12',
    ]);
    const daily = chartDates('1Y', '2026-10-20', MAX_AS_OF);
    expect(daily).toEqual(['2026-10-20', '2026-10-21', '2026-10-22']);
    expect(eachWeek(START, MAX_AS_OF)[0]).toBe(START);
    expect(eachWeek(START, MAX_AS_OF).at(-1)).toBe(MAX_AS_OF);
  });

  it('keeps first and last when striding to the read budget', () => {
    const dates = chartDates('All', START, MAX_AS_OF);
    const strided = strideChartDates(dates, 40);
    expect(strided[0]).toBe(START);
    expect(strided[strided.length - 1]).toBe(MAX_AS_OF);
    expect(strided.length).toBeLessThanOrEqual(40);
  });
});

describe('per-account indexed All range', () => {
  const accounts: SeriesAccount[] = [
    account('home', 'real_estate', 1_200_000),
    account('loan', 'liability', 400_000),
    ...Array.from({ length: 10 }, (_, i) => account(`inv_${i}`, 'investments', 480_000)),
    ...Array.from({ length: 8 }, (_, i) => account(`cash_${i}`, 'cash', 91_295.7975)),
    ...Array.from({ length: 7 }, (_, i) => account(`extra_${i}`, 'investments', 0)),
  ];

  const snapshots: SeriesSnapshot[] = [];
  snapshots.push(
    { accountId: 'home', asOf: START, balance: 280_000, source: 'manual' },
    { accountId: 'home', asOf: MAX_AS_OF, balance: 1_200_000, source: 'manual' },
    { accountId: 'loan', asOf: START, balance: 242_124, source: 'manual' },
    { accountId: 'loan', asOf: MAX_AS_OF, balance: 400_000, source: 'manual' },
  );
  for (let i = 0; i < 10; i += 1) {
    snapshots.push(
      { accountId: `inv_${i}`, asOf: '2018-01-01', balance: 200_000, source: 'observed' },
      { accountId: `inv_${i}`, asOf: '2021-11-15', balance: 420_000, source: 'observed' },
      { accountId: `inv_${i}`, asOf: '2025-11-15', balance: 450_000, source: 'observed' },
      { accountId: `inv_${i}`, asOf: MAX_AS_OF, balance: 480_000, source: 'observed' },
    );
  }
  for (let i = 0; i < 8; i += 1) {
    snapshots.push(
      { accountId: `cash_${i}`, asOf: '2025-10-01', balance: 40_000, source: 'observed' },
      { accountId: `cash_${i}`, asOf: '2025-11-15', balance: 70_000, source: 'observed' },
      { accountId: `cash_${i}`, asOf: MAX_AS_OF, balance: 91_295.7975, source: 'observed' },
    );
  }
  for (let i = 0; i < 7; i += 1) {
    snapshots.push(
      {
        accountId: `extra_${i}`,
        asOf: '2024-06-01',
        balance: 0,
        source: 'observed',
      },
      {
        accountId: `extra_${i}`,
        asOf: MAX_AS_OF,
        balance: 0,
        source: 'observed',
      },
    );
  }

  const longAccount: SeriesSnapshot[] = [];
  let day = START;
  for (let i = 0; i < 4613; i += 1) {
    longAccount.push({
      accountId: 'home',
      asOf: day,
      balance: 280_000 + i,
      source: 'manual',
    });
    day = addDays(day, 1);
  }

  it('stays under the Convex read budget for 27 accounts', async () => {
    const dates = chartDates('All', START, MAX_AS_OF);
    const loaded = await loadChartSnapshots(
      memorySnapshotLookup([...snapshots, ...longAccount]),
      accounts.map((row) => row.sourceId),
      dates,
      CONVEX_QUERY_READ_BUDGET,
    );
    expect(loaded.documentsRead).toBeLessThanOrEqual(CONVEX_QUERY_READ_BUDGET);
    expect(loaded.maxAsOf).toBe(MAX_AS_OF);
    expect(loaded.firstAsOf).toBe(START);
  });

  it('carries every class to the max asOf and does not spike on UTC today', async () => {
    const dates = chartDates('All', START, MAX_AS_OF);
    const loaded = await loadChartSnapshots(
      memorySnapshotLookup(snapshots),
      accounts.map((row) => row.sourceId),
      dates,
    );
    const model = buildNetWorthModel({
      accounts,
      snapshots: loaded.snapshots,
      range: 'All',
      asOf: loaded.maxAsOf ?? MAX_AS_OF,
    });

    const last = model.points[model.points.length - 1];
    expect(last.asOf).toBe(MAX_AS_OF);
    expect(last.asOf).not.toBe('2026-10-23');
    expect(model.asOf).toBe(MAX_AS_OF);
    expect(accounts).toHaveLength(27);
    expect(model.accounts).toHaveLength(27);
    expect(last.byClass.cash).toBeGreaterThan(0);
    expect(last.byClass.investments).toBeGreaterThan(0);
    expect(last.byClass.real_estate).toBeGreaterThan(0);
    expect(last.byClass.liability).toBeLessThan(0);

    const expected = 1_200_000 - 400_000 + 10 * 480_000 + 8 * 91_295.7975;
    expect(last.total).toBeCloseTo(expected, 2);
    expect(last.total).toBeCloseTo(6_330_366.38, 2);

    const startPoint = model.points[0];
    expect(startPoint.asOf).toBe(START);
    expect(startPoint.total).toBeLessThan(100_000);
    expect(startPoint.byClass.cash).toBeUndefined();
    expect(startPoint.byClass.investments).toBeUndefined();

    const late2021 = model.points.find((point) => point.asOf >= '2021-11-01' && point.asOf <= '2021-12-31');
    expect(late2021).toBeDefined();
    expect(late2021!.total).toBeGreaterThan(4_000_000);
    expect(late2021!.total).toBeLessThan(5_800_000);

    const nov2025 = model.points.find((point) => point.asOf >= '2025-11-01' && point.asOf <= '2025-11-30');
    expect(nov2025).toBeDefined();
    expect(nov2025!.total).toBeGreaterThan(5_000_000);
    expect(nov2025!.byClass.cash).toBeGreaterThan(0);

    expect(model.points.some((point) => point.asOf === '2026-10-23')).toBe(false);
    expect(model.coverageMarkers.map((marker) => marker.class).sort()).toEqual(
      ['cash', 'investments', 'liability', 'real_estate'].sort(),
    );
  });

  it('does not flatten All to the first 4000 global rows', () => {
    const byAsOf = [...snapshots].sort((a, b) => a.asOf.localeCompare(b.asOf));
    const clipped = byAsOf.slice(0, 4000);
    const onlyEarly = clipped.filter((row) => row.accountId === 'home' || row.accountId === 'loan');
    const clippedModel = buildNetWorthModel({
      accounts,
      snapshots: onlyEarly,
      range: 'All',
      asOf: '2026-10-23',
    });
    const last = clippedModel.points[clippedModel.points.length - 1];
    expect(last.byClass.cash).toBeUndefined();
    expect(last.byClass.investments).toBeUndefined();
    expect(Object.keys(last.byClass).sort()).toEqual(['liability', 'real_estate']);
  });
});
