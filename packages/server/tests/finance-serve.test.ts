import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  classifyServeCheck,
  currentQueryCost,
  decodePoints,
  decodeSeriesPoints,
  diagnosisFromPairs,
  diffNumbers,
  encodePoints,
  encodeSeriesPoints,
  liteSnapshot,
  LIVE_AS_OF,
  LIVE_FIRST_AS_OF,
  payloadBytes,
  rangePointCount,
  rangesOverlapping,
  sanitizePageAccounts,
  SERVE_ACCOUNT_BATCH,
  SERVE_SERIES_BATCH,
  serveQueryCost,
  sameNumbers,
  finiteNumber,
  finiteOrNull,
} from '../convex/finance/serve';
import { RANGE_KEYS, rangeWindow, type ChartPoint } from '../convex/finance/series';
import { pageFromPack, seriesFromPack, sparksFromPack } from '../../../packages/reactnative/lib/finance-packs';

const AS_OF = '2026-10-24';
const FIRST = '2014-03-07';

describe('serve consumers tolerate missing/partial packs', () => {
  it('decode helpers return empty arrays instead of throwing', () => {
    expect(decodePoints(undefined)).toEqual([]);
    expect(decodePoints({} as never)).toEqual([]);
    expect(decodeSeriesPoints(undefined)).toEqual([]);
    expect(decodeSeriesPoints({ dates: ['2026-01-01'] } as never)).toEqual([
      {
        asOf: '2026-01-01',
        value: 0,
        netInvested: 0,
        sp500Equiv: 0,
        valueInterpolated: false,
        estimated: false,
      },
    ]);
  });

  it('pageFromPack returns null for a missing range instead of substituting All', () => {
    const pack = {
      asOf: '2026-10-24',
      version: 1,
      accounts: [],
      ranges: {
        All: {
          headline: 1,
          change: 0,
          changePct: 0,
          assets: 1,
          liabilities: 0,
          byClass: { cash: 1 },
          grain: 'month' as const,
          rollup: 'stale' as const,
          points: encodePoints([{ asOf: '2026-01-01', total: 1, interpolated: false, byClass: { cash: 1 } }]),
          coverage: { asOf: [], label: [], className: [] },
        },
      },
    };
    expect(pageFromPack(pack, '1M')).toBeNull();
    expect(pageFromPack(pack, 'All')?.points).toHaveLength(1);
    expect(pageFromPack({ ...pack, ranges: { '1M': { headline: 1 } as never } }, '1M')).toBeNull();
    expect(pageFromPack(null, 'All')).toBeNull();
    expect(
      sparksFromPack(
        {
          ...pack,
          sparks: {
            '3M': {
              dates: ['2026-10-01'],
              rows: [
                {
                  sourceId: 'acc_1',
                  values: [1],
                  change: 0,
                  changePct: 0,
                  tone: 'flat',
                  weighted: { change: 0, pct: 0, tone: 'flat' },
                },
              ],
              groups: [],
            },
          },
        },
        '3M',
      )?.rows[0].sourceId,
    ).toBe('acc_1');
    expect(sparksFromPack(pack, '3M')).toBeNull();
  });

  it('Finances screen reads sparklines from pagePack instead of one query per range', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../reactnative/app/(tabs)/finances.tsx'),
      'utf8',
    );
    expect(src).toContain('sparksFromPack');
    expect(src).toContain('pagePack');
    expect(src.match(/api\.finance\.accounts\.sparklines/g)?.length).toBe(1);
  });

  it('strips extra snapshot fields so Convex object validators accept serve accounts', () => {
    expect(liteSnapshot({ accountId: 'acc_1', asOf: '2026-10-24', balance: 10, source: 'observed' })).toEqual({
      asOf: '2026-10-24',
      balance: 10,
      source: 'observed',
    });
    const accounts = sanitizePageAccounts([
      {
        sourceId: 'acc_1',
        name: 'Cash',
        class: 'cash',
        provider: 'manual',
        isManual: true,
        currentBalance: 10,
        signedBalance: 10,
        currency: 'USD',
        syncedAt: 1,
        firstAsOf: '2026-01-01',
        latestSnapshot: { accountId: 'acc_1', asOf: '2026-10-24', balance: 10, source: 'observed' },
      },
    ]);
    expect(accounts[0]?.latestSnapshot).toEqual({ asOf: '2026-10-24', balance: 10, source: 'observed' });
    expect(sanitizePageAccounts(undefined)).toEqual([]);
  });
});

describe('columnar encode/decode keeps full resolution', () => {
  it('round-trips chart points without dropping days', () => {
    const points: ChartPoint[] = [
      { asOf: '2026-01-01', total: 10, interpolated: false, byClass: { cash: 4, investments: 6 } },
      { asOf: '2026-01-02', total: 12, interpolated: true, byClass: { cash: 4, investments: 8 } },
    ];
    const col = encodePoints(points);
    expect(col.dates).toEqual(['2026-01-01', '2026-01-02']);
    expect(decodePoints(col)).toEqual(points);
    expect(sameNumbers(col.totals, [10, 12])).toBe(true);
  });

  it('round-trips series points', () => {
    const points = [
      {
        asOf: '2026-01-01',
        value: 1,
        netInvested: 1,
        sp500Equiv: 1,
        valueInterpolated: false,
        estimated: false,
      },
      {
        asOf: '2026-01-02',
        value: 1.1,
        netInvested: 1,
        sp500Equiv: 1.05,
        valueInterpolated: true,
        estimated: false,
      },
    ];
    expect(decodeSeriesPoints(encodeSeriesPoints(points))).toEqual(points);
  });
});

describe('posh-mink-581 query cost model (27 accounts, 2014-03-07 → 2026-10-24)', () => {
  it('reports before/after documents read and payload bytes per range', () => {
    const rows = RANGE_KEYS.map((range) => {
      const points = rangePointCount(range, AS_OF, FIRST);
      const page = currentQueryCost({ query: 'page', range, asOf: AS_OF, firstAsOf: FIRST });
      const sparks = currentQueryCost({ query: 'sparklines', range, asOf: AS_OF, firstAsOf: FIRST });
      const detail = currentQueryCost({ query: 'detail', range, asOf: AS_OF, firstAsOf: FIRST });
      const series = currentQueryCost({ query: 'series', range, asOf: AS_OF, firstAsOf: FIRST });
      const fatPage = payloadBytes({
        range,
        points: Array.from({ length: points }, (_, i) => ({
          asOf: `2026-01-01`,
          total: 100 + i,
          interpolated: false,
          byClass: { cash: 1, investments: 2, real_estate: 3, liability: -1 },
        })),
        accounts: Array.from({ length: 27 }, (_, i) => ({
          sourceId: `a${i}`,
          name: `Account ${i}`,
          class: 'investment',
          provider: 'plaid',
          isManual: false,
          currentBalance: 1,
          signedBalance: 1,
          currency: 'USD',
          syncedAt: 0,
          firstAsOf: FIRST,
          latestSnapshot: { asOf: AS_OF, balance: 1, source: 'observed' },
        })),
      });
      const compact = payloadBytes({
        dates: Array.from({ length: points }, () => '2026-01-01'),
        totals: Array.from({ length: points }, (_, i) => 100 + i),
        interpolated: Array.from({ length: points }, () => 0),
        classKeys: ['cash', 'investments', 'real_estate', 'liability'],
        classCols: [0, 1, 2, 3].map(() => Array.from({ length: points }, () => 1)),
      });
      return {
        range,
        points,
        before: {
          pageDocs: page.documentsRead,
          sparkDocs: sparks.documentsRead,
          detailDocs: detail.documentsRead,
          seriesDocs: series.documentsRead,
          pageBytes: fatPage,
        },
        after: {
          pageDocs: serveQueryCost('page').documentsRead,
          sparkDocs: serveQueryCost('sparklines').documentsRead,
          detailDocs: serveQueryCost('detail').documentsRead,
          seriesDocs: serveQueryCost('series').documentsRead,
          pageBytes: compact,
        },
      };
    });

    for (const row of rows) {
      expect(row.after.pageDocs).toBe(1);
      expect(row.after.sparkDocs).toBe(1);
      expect(row.after.pageBytes).toBeLessThan(row.before.pageBytes);
      expect(row.before.sparkDocs).toBeGreaterThan(800);
    }
    const ytd = rows.find((row) => row.range === 'YTD');
    expect(ytd?.points).toBeGreaterThan(250);
    expect(ytd?.before.sparkDocs).toBeGreaterThan(7000);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ measure: 'finance.serve.posh-mink-581', rows }, null, 2));
  });
});

describe('rangesOverlapping dirty-from-forward', () => {
  it('includes 1M/3M/YTD/1Y/5Y after a full rebuild from first coverage', () => {
    expect(rangesOverlapping(LIVE_FIRST_AS_OF, LIVE_AS_OF, LIVE_FIRST_AS_OF)).toEqual([...RANGE_KEYS]);
  });

  it('includes short ranges when only recent days are dirty', () => {
    expect(rangesOverlapping('2026-10-20', LIVE_AS_OF, LIVE_FIRST_AS_OF)).toEqual([...RANGE_KEYS]);
  });

  it('does not treat window.contains(from) as the dirty rule', () => {
    const contained = RANGE_KEYS.filter((range) => {
      const { from } = rangeWindow(range, LIVE_AS_OF, LIVE_FIRST_AS_OF);
      return from <= LIVE_FIRST_AS_OF || range === 'All';
    });
    expect(contained).toEqual(['All']);
    expect(rangesOverlapping(LIVE_FIRST_AS_OF, LIVE_AS_OF, LIVE_FIRST_AS_OF)).not.toEqual(contained);
  });
});

describe('serve payload numbers', () => {
  it('drops NaN/Infinity so Convex validators accept serve docs', () => {
    expect(finiteNumber(Number.NaN)).toBe(0);
    expect(finiteNumber(Number.POSITIVE_INFINITY, 3)).toBe(3);
    expect(finiteOrNull(Number.NaN)).toBeNull();
    expect(finiteOrNull(1.25)).toBe(1.25);
  });
});

describe('writeAffected step caps', () => {
  it('keeps per-step account/series batches small', () => {
    expect(SERVE_ACCOUNT_BATCH).toBeLessThanOrEqual(4);
    expect(SERVE_SERIES_BATCH).toBeLessThanOrEqual(2);
  });

  it('recomputeAll omits from so the chain cannot collapse to All', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../convex/finance/serveJobs.ts'),
      'utf8',
    );
    expect(src).toContain('internal.finance.serveJobs.writeAffected, {}');
    expect(src).toContain('from: args.from');
    expect(src).toMatch(/args\.from == null/);
    expect(src).toContain('SERVE_ACCOUNT_BATCH');
    expect(src).toContain('cursor.index + 1 < ranges.length');
  });
});

describe('checkConsistency reason/diff', () => {
  it('reports length and first value mismatch', () => {
    expect(diffNumbers([1, 2], [1, 2, 3]).reason).toBe('length');
    const value = diffNumbers([1, 2, 3], [1, 2.5, 3]);
    expect(value.reason).toBe('value');
    expect(value.firstDiffIndex).toBe(1);
    expect(value.storedValue).toBe(2);
    expect(value.liveValue).toBe(2.5);
  });

  it('treats missing series with no source as ok/no_source, not a fail', () => {
    const pair = classifyServeCheck({
      kind: 'series',
      scopeId: 'total',
      range: '1M',
      hasServe: false,
      hasSource: false,
      liveAvailable: false,
    });
    expect(pair).toMatchObject({ ok: true, reason: 'no_source' });
  });

  it('distinguishes serve_missing from live_raw and value diffs', () => {
    expect(
      classifyServeCheck({
        kind: 'page',
        scopeId: 'net',
        range: 'YTD',
        hasServe: false,
        hasSource: true,
        liveAvailable: true,
        liveFreshness: 'stale',
      }).reason,
    ).toBe('serve_missing');
    expect(
      classifyServeCheck({
        kind: 'page',
        scopeId: 'net',
        range: 'YTD',
        hasServe: false,
        hasSource: true,
        liveAvailable: false,
        liveFreshness: 'raw',
      }).reason,
    ).toBe('live_raw');
    const value = classifyServeCheck({
      kind: 'page',
      scopeId: 'net',
      range: '1M',
      hasServe: true,
      hasSource: true,
      liveAvailable: true,
      storedValues: [10, 20],
      liveValues: [10, 21],
      storedDates: ['2026-10-01', '2026-10-02'],
      liveDates: ['2026-10-01', '2026-10-02'],
      serveVersion: 3,
      serveAsOf: '2026-10-24',
    });
    expect(value).toMatchObject({
      ok: false,
      reason: 'value',
      firstDiffIndex: 1,
      storedAt: '2026-10-02',
      liveAt: '2026-10-02',
      storedValue: 20,
      liveValue: 21,
      serveVersion: 3,
    });
  });

  it('diagnoses incomplete recompute vs numeric mismatch', () => {
    expect(
      diagnosisFromPairs([
        { ok: false, reason: 'serve_missing' },
        { ok: false, reason: 'live_raw' },
      ]),
    ).toBe('incomplete');
    expect(diagnosisFromPairs([{ ok: false, reason: 'value' }])).toBe('mismatch');
    expect(
      diagnosisFromPairs([
        { ok: false, reason: 'serve_missing' },
        { ok: false, reason: 'value' },
      ]),
    ).toBe('mixed');
    expect(diagnosisFromPairs([{ ok: true, reason: 'ok' }])).toBe('ok');
  });
});

describe('client pack expand', () => {
  it('expands a columnar page pack to the chart model', () => {
    const points = encodePoints([
      { asOf: '2026-10-01', total: 10, interpolated: false, byClass: { cash: 10 } },
      { asOf: '2026-10-24', total: 12, interpolated: false, byClass: { cash: 12 } },
    ]);
    const model = pageFromPack(
      {
        asOf: '2026-10-24',
        version: 1,
        accounts: [],
        ranges: {
          '3M': {
            headline: 12,
            change: 2,
            changePct: 0.2,
            assets: 12,
            liabilities: 0,
            byClass: { cash: 12 },
            grain: 'day',
            rollup: 'live',
            points,
            coverage: { asOf: [], label: [], className: [] },
          },
        },
      },
      '3M',
    );
    expect(model?.points).toHaveLength(2);
    expect(model?.headline).toBe(12);
  });

  it('expands a series pack without dropping points', () => {
    const packed = seriesFromPack(
      {
        scope: 'total',
        asOf: '2026-10-24',
        version: 1,
        ranges: {
          YTD: {
            grain: 'day',
            rollup: 'live',
            points: encodeSeriesPoints([
              {
                asOf: '2026-01-01',
                value: 1,
                netInvested: 1,
                sp500Equiv: 1,
                valueInterpolated: false,
                estimated: false,
              },
            ]),
            twr: null,
            sp500Twr: null,
          },
        },
      },
      'YTD',
    );
    expect(packed?.points).toHaveLength(1);
  });
});
