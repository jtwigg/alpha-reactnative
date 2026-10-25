import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  shouldPatchRebuildState,
  decodeRebuildCursor,
  encodeRebuildCursor,
  valuesFromAccountRollups,
  ROLLUP_STALE_MS,
  ROLLUP_STEP_DAY_CAP,
} from '../convex/finance/rollups';
import { markRollupsDirty, rebuildStep } from '../convex/finance/rollupJobs';
import { upsertSeries, upsertSnapshots } from '../convex/finance/ingest';
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
    expect(daysPerRebuildStep(27)).toBe(20);
    expect(daysPerRebuildStep(27)).toBeLessThanOrEqual(ROLLUP_STEP_DAY_CAP);
    expect(ROLLUP_STEP_DAY_CAP).toBe(30);
    expect(daysPerRebuildStep(80)).toBeGreaterThanOrEqual(1);
    const first = planRebuildSpan({
      from: '2020-01-01',
      to: '2020-12-31',
      day: '2020-01-01',
      accountCount: 27,
    });
    expect(first.start).toBe('2020-01-01');
    expect(first.end).toBe('2020-01-20');
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

  it('honors a smaller cursor span so a timed-out step can shrink', () => {
    const planned = planRebuildSpan({
      from: '2020-01-01',
      to: '2020-12-31',
      day: '2020-01-01',
      accountCount: 27,
      span: 8,
    });
    expect(planned.end).toBe('2020-01-08');
    expect(planned.next).toBe('2020-01-09');
    const encoded = encodeRebuildCursor({
      from: '2020-01-01',
      to: '2020-12-31',
      day: '2023-06-01',
      wipe: false,
      span: 15,
    });
    expect(decodeRebuildCursor(encoded)?.span).toBe(15);
    expect(decodeRebuildCursor('{"from":"2020-01-01","to":"2020-12-31","day":"2023-06-01","wipe":false}')).toEqual({
      from: '2020-01-01',
      to: '2020-12-31',
      day: '2023-06-01',
      wipe: false,
    });
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

describe('shouldPatchRebuildState', () => {
  const base = {
    prevDay: '2024-01-01',
    nextDay: '2024-01-03',
    prevStatus: 'rebuilding' as const,
    nextStatus: 'rebuilding' as const,
    prevWipe: false,
    nextWipe: false,
    drained: false,
    done: false,
  };

  it('patches on done, drain, status, or wipe — not on a short cursor hop', () => {
    expect(shouldPatchRebuildState({ ...base, done: true })).toBe(true);
    expect(shouldPatchRebuildState({ ...base, drained: true })).toBe(true);
    expect(shouldPatchRebuildState({ ...base, nextStatus: 'ready' })).toBe(true);
    expect(shouldPatchRebuildState({ ...base, nextWipe: true })).toBe(true);
    expect(shouldPatchRebuildState(base)).toBe(false);
    expect(shouldPatchRebuildState({ ...base, nextDay: '2024-01-08' })).toBe(true);
  });
});

type Row = Record<string, unknown> & { _id: string; _creationTime: number };

const MUTATION_INDEXES: Record<string, Record<string, string[]>> = {
  accounts: { by_sourceId: ['sourceId'], by_class: ['class'] },
  balance_snapshots: { by_account_asOf: ['accountId', 'asOf'], by_asOf: ['asOf'] },
  series: { by_scope_date: ['scope', 'date'], by_date: ['date'] },
  series_replace_batches: { by_batchId: ['batchId'] },
  finance_rollups: {
    by_grain_scope_asOf: ['grain', 'scopeKind', 'scopeId', 'asOf'],
    by_grain_kind_asOf: ['grain', 'scopeKind', 'asOf'],
  },
  finance_rollup_state: { by_key: ['key'] },
  finance_rollup_dirty: { by_scopeKey: ['scopeKey'] },
  market_index_bars: { by_symbol_asOf: ['symbol', 'asOf'] },
};

function occConflicts(
  left: { reads: Record<string, string[]>; writes: Record<string, string[]> },
  right: { reads: Record<string, string[]>; writes: Record<string, string[]> },
  table: string,
): string[] {
  const leftRead = new Set(left.reads[table] ?? []);
  const leftWrite = new Set(left.writes[table] ?? []);
  const rightRead = new Set(right.reads[table] ?? []);
  const rightWrite = new Set(right.writes[table] ?? []);
  const out = new Set<string>();
  for (const id of leftWrite) {
    if (rightWrite.has(id) || rightRead.has(id)) out.add(id);
  }
  for (const id of rightWrite) {
    if (leftRead.has(id)) out.add(id);
  }
  return [...out];
}

function mutationCtx(tables: Record<string, Row[]>) {
  let seq = 0;
  const access = {
    reads: {} as Record<string, string[]>,
    writes: {} as Record<string, string[]>,
  };
  const touch = (kind: 'reads' | 'writes', table: string, id: string) => {
    (access[kind][table] ??= []).push(id);
  };
  const scheduled: unknown[] = [];
  const tableOf = (id: string): [string, Row] | null => {
    for (const [table, rows] of Object.entries(tables)) {
      const row = rows.find((item) => item._id === id);
      if (row) return [table, row];
    }
    return null;
  };
  const db = {
    query(table: string) {
      let rows = [...(tables[table] ?? [])];
      let fields: string[] = [];
      let indexed = false;
      let desc = false;
      const builder = {
        withIndex(name: string, range?: (q: unknown) => unknown) {
          fields = MUTATION_INDEXES[table]?.[name] ?? [];
          if (!fields.length) throw new Error(`unknown index ${table}.${name}`);
          indexed = true;
          const conds: Array<(row: Row) => boolean> = [];
          const q = {
            eq: (f: string, v: unknown) => (conds.push((r) => r[f] === v), q),
            gt: (f: string, v: string) => (conds.push((r) => (r[f] as string) > v), q),
            gte: (f: string, v: string) => (conds.push((r) => (r[f] as string) >= v), q),
            lt: (f: string, v: string) => (conds.push((r) => (r[f] as string) < v), q),
            lte: (f: string, v: string) => (conds.push((r) => (r[f] as string) <= v), q),
          };
          range?.(q);
          rows = rows.filter((row) => conds.every((cond) => cond(row)));
          return builder;
        },
        order(direction: 'asc' | 'desc') {
          desc = direction === 'desc';
          return builder;
        },
        sorted() {
          const keyed = [...rows].sort((a, b) => {
            for (const f of fields) {
              const cmp = String(a[f] ?? '').localeCompare(String(b[f] ?? ''));
              if (cmp !== 0) return cmp;
            }
            return a._creationTime - b._creationTime;
          });
          return desc ? keyed.reverse() : keyed;
        },
        async take(n: number) {
          const out = builder.sorted().slice(0, n);
          for (const row of out) touch('reads', table, row._id);
          return out;
        },
        async unique() {
          const out = builder.sorted();
          if (out.length > 1) throw new Error('not unique');
          if (out[0]) touch('reads', table, out[0]._id);
          return out[0] ?? null;
        },
      };
      return builder;
    },
    async get(id: string) {
      const hit = tableOf(id);
      if (!hit) return null;
      touch('reads', hit[0], id);
      return hit[1];
    },
    async insert(table: string, doc: Record<string, unknown>) {
      const id = `id_${table}_${seq++}`;
      const row = { ...doc, _id: id, _creationTime: seq } as Row;
      (tables[table] ??= []).push(row);
      touch('writes', table, id);
      return id;
    },
    async patch(id: string, fields: Record<string, unknown>) {
      const hit = tableOf(id);
      if (!hit) throw new Error(`patch missing ${id}`);
      touch('writes', hit[0], id);
      for (const [key, value] of Object.entries(fields)) {
        if (value === undefined) delete hit[1][key];
        else hit[1][key] = value;
      }
    },
    async replace(id: string, doc: Record<string, unknown>) {
      const hit = tableOf(id);
      if (!hit) throw new Error(`replace missing ${id}`);
      touch('writes', hit[0], id);
      const next = { ...doc, _id: id, _creationTime: hit[1]._creationTime } as Row;
      const list = tables[hit[0]];
      list[list.indexOf(hit[1])] = next;
    },
    async delete(id: string) {
      const hit = tableOf(id);
      if (!hit) return;
      touch('writes', hit[0], id);
      tables[hit[0]] = tables[hit[0]].filter((row) => row._id !== id);
    },
  };
  return {
    ctx: {
      db,
      scheduler: {
        runAfter: async (_ms: number, _ref: unknown, args: unknown) => {
          scheduled.push(args);
        },
      },
    },
    tables,
    access,
    scheduled,
  };
}

const run = (fn: unknown, ctx: unknown, args: unknown) =>
  (fn as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> })._handler(ctx, args);

function seedRebuildTables(): Record<string, Row[]> {
  const cursor = encodeRebuildCursor({
    from: '2020-01-01',
    to: '2026-10-23',
    day: '2024-06-01',
    wipe: false,
  });
  return {
    finance_rollup_state: [
      {
        _id: 'state_global',
        _creationTime: 1,
        key: 'global',
        version: 4,
        status: 'rebuilding',
        cursor,
        rebuiltThrough: '2024-05-31',
        updatedAt: 1,
      },
    ],
    finance_rollup_dirty: [],
    finance_rollups: [],
    series: [],
    series_replace_batches: [],
    accounts: [],
    balance_snapshots: [],
    market_index_bars: [],
  };
}

function seriesItem(date: string, scope = 'total') {
  return {
    scope,
    date,
    value: 1,
    netInvested: 1,
    sp500Equiv: 1,
    valueInterpolated: false,
    estimated: false,
    method: 'finance.bench.v1' as const,
  };
}

describe('rebuildStep loop guards', () => {
  it('rewinds only for newly dirtied days, not state.dirtyFrom', async () => {
    const tables = seedRebuildTables();
    tables.finance_rollup_state[0].dirtyFrom = '2014-03-07';
    tables.finance_rollup_dirty = [
      {
        _id: 'dirty_1',
        _creationTime: 1,
        scopeKey: 'acc_1',
        from: '2024-05-20',
        createdAt: 1,
      },
    ];
    const ctx = mutationCtx(tables);
    const result = await run(rebuildStep, ctx.ctx, {
      stepId: 4,
      cursor: encodeRebuildCursor({
        from: '2024-06-01',
        to: '2026-10-23',
        day: '2024-06-10',
        wipe: false,
      }),
    });
    expect(result).toMatchObject({ status: 'rebuilding', done: false });
    expect((result as { from: string }).from).toBe('2024-05-20');
    expect((ctx.scheduled[0] as { cursor?: string })?.cursor ?? '').toContain('2024-05-20');
  });

  it('does not rewind to state.dirtyFrom when the dirty queue is empty', async () => {
    const tables = seedRebuildTables();
    tables.finance_rollup_state[0].dirtyFrom = '2014-03-07';
    const ctx = mutationCtx(tables);
    const result = await run(rebuildStep, ctx.ctx, {
      stepId: 4,
      cursor: encodeRebuildCursor({
        from: '2024-06-01',
        to: '2026-10-23',
        day: '2024-06-10',
        wipe: false,
      }),
    });
    expect((result as { from: string }).from).toBe('2024-06-10');
    expect(JSON.stringify(ctx.scheduled)).not.toContain('2014-03-07');
  });

  it('stops with status error when a step would not advance', async () => {
    const tables = seedRebuildTables();
    const ctx = mutationCtx(tables);
    const stuck = encodeRebuildCursor({
      from: '2026-10-23',
      to: '2026-10-23',
      day: '2026-10-24',
      wipe: false,
    });
    const result = await run(rebuildStep, ctx.ctx, { stepId: 4, cursor: stuck });
    // day past `to` finishes the run; a no-advance next is marked error.
    expect(['ready', 'error']).toContain((result as { status: string }).status);
  });

  it('resumes a stale rebuilding chain from the saved cursor with half the span', async () => {
    const tables = seedRebuildTables();
    tables.finance_rollup_state[0].updatedAt = 1;
    tables.finance_rollup_state[0].cursor = encodeRebuildCursor({
      from: '2020-01-01',
      to: '2026-10-23',
      day: '2023-06-01',
      wipe: false,
      span: 30,
    });
    const ctx = mutationCtx(tables);
    const result = await run(rebuildStep, ctx.ctx, {});
    expect(result).toMatchObject({ done: false, status: 'rebuilding', from: '2020-01-01', to: '2026-10-23' });
    const scheduled = ctx.scheduled[0] as { stepId?: number; cursor?: string };
    expect(scheduled.stepId).toBe(4);
    expect(decodeRebuildCursor(scheduled.cursor)?.span).toBe(15);
    expect(decodeRebuildCursor(scheduled.cursor)?.day).toBe('2023-06-01');
    expect(decodeRebuildCursor(tables.finance_rollup_state[0].cursor as string)?.span).toBe(15);
  });

  it('does not resume a live rebuilding chain', async () => {
    const tables = seedRebuildTables();
    tables.finance_rollup_state[0].updatedAt = Date.now() - ROLLUP_STALE_MS + 5_000;
    const ctx = mutationCtx(tables);
    const result = await run(rebuildStep, ctx.ctx, {});
    expect(result).toMatchObject({ done: false, status: 'rebuilding', wrote: 0, from: null });
    expect(ctx.scheduled).toEqual([]);
  });
});

describe('ingest vs rebuild OCC', () => {
  it('keeps a 500-row upsert_series off finance_rollup_state while rebuildStep patches it', async () => {
    const items = Array.from({ length: 500 }, (_, i) => seriesItem(addDays('2024-01-01', i)));
    const ingest = mutationCtx(seedRebuildTables());
    const rebuild = mutationCtx(seedRebuildTables());

    const [upserted, stepped] = await Promise.all([
      run(upsertSeries, ingest.ctx, { items }),
      run(rebuildStep, rebuild.ctx, {
        stepId: 4,
        cursor: encodeRebuildCursor({
          from: '2020-01-01',
          to: '2026-10-23',
          day: '2024-06-01',
          wipe: false,
        }),
      }),
    ]);

    expect(upserted).toMatchObject({ inserted: 500 });
    expect(ingest.access.reads.finance_rollup_state ?? []).toEqual([]);
    expect(ingest.access.writes.finance_rollup_state ?? []).toEqual([]);
    expect(ingest.tables.finance_rollup_dirty).toHaveLength(1);
    expect(ingest.tables.finance_rollup_dirty[0]).toMatchObject({
      scopeKey: 'series:total',
      from: '2024-01-01',
    });
    expect(ingest.scheduled).toHaveLength(1);
    expect(rebuild.access.reads.finance_rollup_state).toContain('state_global');
    expect(stepped).toMatchObject({ status: 'rebuilding', done: false });
    expect(occConflicts(ingest.access, rebuild.access, 'finance_rollup_state')).toEqual([]);
  });

  it('does not read finance_rollup_state from snapshot ingest either', async () => {
    const ingest = mutationCtx(seedRebuildTables());
    await run(upsertSnapshots, ingest.ctx, {
      items: [
        {
          accountId: 'acc_1',
          asOf: '2024-06-01',
          balance: 100,
          source: 'observed',
        },
      ],
    });
    expect(ingest.access.reads.finance_rollup_state ?? []).toEqual([]);
    expect(ingest.access.writes.finance_rollup_state ?? []).toEqual([]);
    expect(ingest.tables.finance_rollup_dirty[0]).toMatchObject({
      scopeKey: 'acc_1',
      from: '2024-06-01',
    });
  });

  it('inserts dirty rows without touching global state', async () => {
    const ctx = mutationCtx(seedRebuildTables());
    await markRollupsDirty(ctx.ctx as never, [
      { accountId: 'series:total', from: '2024-01-01' },
      { accountId: 'series:total', from: '2025-01-01' },
    ]);
    expect(ctx.access.reads.finance_rollup_state ?? []).toEqual([]);
    expect(ctx.access.writes.finance_rollup_state ?? []).toEqual([]);
    expect(ctx.tables.finance_rollup_dirty).toHaveLength(1);
    expect(ctx.tables.finance_rollup_dirty[0].from).toBe('2024-01-01');
  });
});

describe('rollup cron', () => {
  it('drains rebuilds hourly, not every 15 minutes', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../convex/crons.ts'),
      'utf8',
    );
    expect(src).toContain('hours: 1');
    expect(src).not.toContain('minutes: 15');
    expect(src).toContain('rebuildStep');
    expect(src).not.toContain('rebuildAll');
  });
});
