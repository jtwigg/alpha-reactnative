import { describe, expect, it } from 'vitest';
import { addDays, eachDate, eachWeek } from '../convex/finance/dates';
import {
  accountDayValue,
  aggregateAccountDays,
  benchDays,
  compareRollupToRaw,
  computeAccountDays,
  daysPerRebuildStep,
  earliestDirty,
  enclosingMonthEnds,
  enclosingWeekEnds,
  grainDates,
  grainForRange,
  mergeDiries,
  mergeDirtyFrom,
  modelFromRollupPoints,
  pickSampleDates,
  planRebuildSpan,
  readerMode,
  rollupCoarse,
  rollupCoversRange,
  valuesFromAccountRollups,
} from '../convex/finance/rollups';
import {
  buildNetWorthModel,
  chartDates,
  loadChartSnapshots,
  memorySnapshotLookup,
  type SeriesAccount,
  type SeriesSnapshot,
} from '../convex/finance/series';
import { CONVEX_QUERY_READ_BUDGET } from '../convex/finance/validators';

describe('grainForRange', () => {
  it('picks the coarsest grain that fits', () => {
    expect(grainForRange('1M')).toBe('day');
    expect(grainForRange('3M')).toBe('day');
    expect(grainForRange('YTD')).toBe('day');
    expect(grainForRange('1Y')).toBe('week');
    expect(grainForRange('5Y')).toBe('month');
    expect(grainForRange('All')).toBe('month');
  });
});

describe('dirty watermarks', () => {
  it('keeps the earliest affected date per account', () => {
    expect(mergeDirtyFrom(null, '2024-06-01')).toBe('2024-06-01');
    expect(mergeDirtyFrom('2024-06-01', '2025-01-01')).toBe('2024-06-01');
    expect(mergeDirtyFrom('2025-01-01', '2024-06-01')).toBe('2024-06-01');
    const merged = mergeDiries(
      [{ accountId: 'a', from: '2024-06-01' }],
      [
        { accountId: 'a', from: '2025-01-01' },
        { accountId: 'b', from: '2023-01-01' },
      ],
    );
    expect(merged).toEqual([
      { accountId: 'a', from: '2024-06-01' },
      { accountId: 'b', from: '2023-01-01' },
    ]);
    expect(earliestDirty(merged)).toBe('2023-01-01');
  });
});

describe('rebuild batching', () => {
  it('stays inside the write budget and is idempotent to plan', () => {
    expect(daysPerRebuildStep(27)).toBeLessThanOrEqual(21);
    expect(daysPerRebuildStep(80)).toBeGreaterThanOrEqual(1);
    const first = planRebuildSpan({
      from: '2020-01-01',
      to: '2020-12-31',
      day: '2020-01-01',
      accountCount: 27,
    });
    expect(first.start).toBe('2020-01-01');
    expect(first.end >= first.start).toBe(true);
    expect(first.next).toBe(addDays(first.end, 1));
    const again = planRebuildSpan({
      from: '2020-01-01',
      to: '2020-12-31',
      day: '2020-01-01',
      accountCount: 27,
    });
    expect(again).toEqual(first);
    const last = planRebuildSpan({
      from: '2020-01-01',
      to: first.end,
      day: first.start,
      accountCount: 27,
    });
    expect(last.next).toBeNull();
  });
});

describe('carry-forward invalidation', () => {
  it('recomputes later days after an early backfill', () => {
    const snaps = [
      { asOf: '2024-01-01', balance: 100, source: 'observed' as const },
      { asOf: '2024-01-10', balance: 400, source: 'observed' as const },
    ];
    const days = computeAccountDays({
      snaps,
      from: '2024-01-01',
      to: '2024-01-12',
      current: { balance: 400, asOf: '2024-01-12' },
    });
    expect(days[0]).toMatchObject({ asOf: '2024-01-01', value: 100 });
    expect(days.at(-1)).toMatchObject({ asOf: '2024-01-12', value: 400, interpolated: false });
    const mid = days.find((row) => row.asOf === '2024-01-05');
    expect(mid?.interpolated).toBe(true);
    expect(mid?.value).toBeCloseTo(100 + (300 * 4) / 9, 5);

    const backfilled = computeAccountDays({
      snaps: [{ asOf: '2024-01-01', balance: 50, source: 'observed' as const }, snaps[1]],
      from: '2024-01-01',
      to: '2024-01-12',
      current: { balance: 400, asOf: '2024-01-12' },
    });
    expect(backfilled[0]?.value).toBe(50);
    expect(backfilled.find((row) => row.asOf === '2024-01-05')?.value).not.toBe(mid?.value);
    expect(backfilled.at(-1)?.value).toBe(400);
  });

  it('rolls days into enclosing weeks and months from the last day in the bucket', () => {
    const days = eachDate('2024-01-01', '2024-01-31').map((asOf, index) => ({
      asOf,
      value: 100 + index,
      interpolated: false,
    }));
    const weeks = rollupCoarse(days, 'week', '2024-01-01', '2024-01-31');
    const months = rollupCoarse(days, 'month', '2024-01-01', '2024-01-31');
    expect(enclosingWeekEnds('2024-01-01', '2024-01-31').length).toBeGreaterThan(3);
    expect(enclosingMonthEnds('2024-01-01', '2024-01-31')).toEqual(['2024-01-31']);
    expect(weeks.at(-1)?.asOf).toBe('2024-02-04');
    expect(months).toEqual([{ asOf: '2024-01-31', value: 130, interpolated: false }]);
  });
});

describe('aggregates and S&P', () => {
  it('sums signed class and group totals', () => {
    const aggregated = aggregateAccountDays([
      {
        accountId: 'cash',
        className: 'cash',
        days: [{ asOf: '2024-01-01', value: 100, interpolated: false }],
      },
      {
        accountId: 'loan',
        className: 'liability',
        days: [{ asOf: '2024-01-01', value: 40, interpolated: false }],
      },
    ]);
    expect(aggregated).toHaveLength(1);
    expect(aggregated[0].total).toBe(60);
    expect(aggregated[0].byClass).toEqual({ cash: 100, liability: -40 });
    expect(aggregated[0].byGroup.cash).toBe(100);
    expect(aggregated[0].byGroup.liability).toBe(-40);
  });

  it('carries S&P closes onto days without a bar', () => {
    const days = benchDays(
      [
        { asOf: '2024-01-02', close: 4700 },
        { asOf: '2024-01-04', close: 4720 },
      ],
      '2024-01-01',
      '2024-01-05',
    );
    expect(days.find((row) => row.asOf === '2024-01-01')).toBeUndefined();
    expect(days.find((row) => row.asOf === '2024-01-03')).toMatchObject({
      value: 4700,
      interpolated: true,
    });
    expect(days.find((row) => row.asOf === '2024-01-04')).toMatchObject({
      value: 4720,
      interpolated: false,
    });
  });
});

describe('reader watermark', () => {
  it('falls back to raw without coverage and marks pending rebuilds stale', () => {
    expect(readerMode({ state: null, hasCoverage: false, asOf: '2026-01-01' })).toBe('raw');
    expect(
      readerMode({
        state: { dirtyFrom: '2024-01-01', rebuiltThrough: '2026-01-01', version: 2, status: 'rebuilding' },
        hasCoverage: true,
        asOf: '2026-01-01',
      }),
    ).toBe('stale');
    expect(
      readerMode({
        state: { dirtyFrom: null, rebuiltThrough: '2026-10-22', version: 3, status: 'ready' },
        hasCoverage: true,
        asOf: '2026-10-22',
      }),
    ).toBe('live');
    expect(
      rollupCoversRange({
        rows: [{ asOf: '2014-03-31' }, { asOf: '2026-10-31' }],
        from: '2014-03-07',
        to: '2026-10-22',
        grain: 'month',
      }),
    ).toBe(true);
  });
});

describe('consistency vs raw', () => {
  it('matches accountValueOnDay totals on sampled dates', () => {
    const snaps = [
      { asOf: '2024-01-01', balance: 100, source: 'observed' as const },
      { asOf: '2024-01-31', balance: 200, source: 'observed' as const },
    ];
    const days = computeAccountDays({
      snaps,
      from: '2024-01-01',
      to: '2024-01-31',
      current: { balance: 200, asOf: '2024-01-31' },
    });
    const samples = pickSampleDates('2024-01-01', '2024-01-31', 8, 7);
    expect(samples).toHaveLength(8);
    for (const asOf of samples) {
      const rollup = days.find((row) => row.asOf === asOf);
      const raw = accountDayValue(snaps, asOf, { balance: 200, asOf: '2024-01-31' });
      expect(rollup && raw && compareRollupToRaw(rollup.value, raw.value)).toBe(true);
    }
  });
});

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

describe('before/after page payload', () => {
  const accounts: SeriesAccount[] = [
    account('home', 'real_estate', 1_200_000),
    account('loan', 'liability', 400_000),
    ...Array.from({ length: 10 }, (_, i) => account(`inv_${i}`, 'investments', 480_000)),
    ...Array.from({ length: 8 }, (_, i) => account(`cash_${i}`, 'cash', 91_295.7975)),
    ...Array.from({ length: 7 }, (_, i) => account(`extra_${i}`, 'investments', 0)),
  ];
  const snapshots: SeriesSnapshot[] = [
    { accountId: 'home', asOf: START, balance: 280_000, source: 'manual' },
    { accountId: 'home', asOf: MAX_AS_OF, balance: 1_200_000, source: 'manual' },
    { accountId: 'loan', asOf: START, balance: 242_124, source: 'manual' },
    { accountId: 'loan', asOf: MAX_AS_OF, balance: 400_000, source: 'manual' },
  ];
  for (let i = 0; i < 10; i += 1) {
    snapshots.push(
      { accountId: `inv_${i}`, asOf: '2018-01-01', balance: 200_000, source: 'observed' },
      { accountId: `inv_${i}`, asOf: MAX_AS_OF, balance: 480_000, source: 'observed' },
    );
  }
  for (let i = 0; i < 8; i += 1) {
    snapshots.push(
      { accountId: `cash_${i}`, asOf: '2025-10-01', balance: 40_000, source: 'observed' },
      { accountId: `cash_${i}`, asOf: MAX_AS_OF, balance: 91_295.7975, source: 'observed' },
    );
  }

  it('monthly rollups shrink All reads and payload vs raw snapshot probes', async () => {
    const dates = chartDates('All', START, MAX_AS_OF);
    const beforeStarted = performance.now();
    const loaded = await loadChartSnapshots(
      memorySnapshotLookup(snapshots),
      accounts.map((row) => row.sourceId),
      dates,
      CONVEX_QUERY_READ_BUDGET,
    );
    const rawModel = buildNetWorthModel({
      accounts,
      snapshots: loaded.snapshots,
      range: 'All',
      asOf: MAX_AS_OF,
    });
    const beforeMs = performance.now() - beforeStarted;
    const beforeBytes = JSON.stringify(rawModel.points).length;

    const firsts = new Map(accounts.flatMap((row) => {
      const first = snapshots.filter((snap) => snap.accountId === row.sourceId).sort((a, b) => a.asOf.localeCompare(b.asOf))[0];
      return first ? [[row.sourceId, first] as const] : [];
    }));
    const lasts = new Map(accounts.flatMap((row) => {
      const last = snapshots.filter((snap) => snap.accountId === row.sourceId).sort((a, b) => a.asOf.localeCompare(b.asOf)).at(-1);
      return last ? [[row.sourceId, last] as const] : [];
    }));

    const afterStarted = performance.now();
    const rollupModel = modelFromRollupPoints({
      accounts,
      firsts,
      lasts,
      points: rawModel.points,
      range: 'All',
      asOf: MAX_AS_OF,
      grain: 'month',
      rollup: 'live',
    });
    const afterMs = performance.now() - afterStarted;
    const afterBytes = JSON.stringify(rollupModel.points).length;
    const afterReads = grainDates('month', START, MAX_AS_OF).length;
    const legacyWeekly = eachWeek(START, MAX_AS_OF);
    const legacyLoaded = await loadChartSnapshots(
      memorySnapshotLookup(snapshots),
      accounts.map((row) => row.sourceId),
      legacyWeekly,
      CONVEX_QUERY_READ_BUDGET,
    );
    const legacyBytes = JSON.stringify(
      buildNetWorthModel({
        accounts,
        snapshots: legacyLoaded.snapshots,
        range: 'All',
        asOf: MAX_AS_OF,
      }).points,
    ).length;

    expect(rawModel.grain).toBe('month');
    expect(rollupModel.rollup).toBe('live');
    expect(rollupModel.points.length).toBe(rawModel.points.length);
    expect(afterReads).toBeLessThan(loaded.documentsRead);
    expect(afterReads).toBeLessThan(legacyLoaded.documentsRead);
    expect(afterReads).toBeLessThan(200);
    expect(loaded.documentsRead).toBeGreaterThan(100);
    expect(afterBytes).toBeLessThanOrEqual(legacyBytes);
    expect(afterMs).toBeLessThan(beforeMs + 50);

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        measure: 'finance.page.All',
        before: {
          ms: Number(beforeMs.toFixed(2)),
          bytes: beforeBytes,
          documentsRead: loaded.documentsRead,
          legacyWeeklyDocumentsRead: legacyLoaded.documentsRead,
          points: rawModel.points.length,
        },
        after: {
          ms: Number(afterMs.toFixed(2)),
          bytes: afterBytes,
          documentsRead: afterReads,
          points: rollupModel.points.length,
        },
      }),
    );
  });

  it('maps account rollup rows onto a sparkline grid', () => {
    const dates = ['2024-01-01', '2024-01-15', '2024-01-31'];
    const values = valuesFromAccountRollups(dates, [
      { asOf: '2024-01-01', value: 10 },
      { asOf: '2024-01-31', value: 30 },
    ]);
    expect(values).toEqual([10, 10, 30]);
  });
});
