import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  SPARKLINE_POINTS,
  STACK_POINTS,
  TRANSACTIONS_PAGE_MAX,
  accountHistory,
  changeTone,
  clampPageSize,
  displayAmount,
  groupAccounts,
  groupByDate,
  groupChartPoints,
  groupKeyForClass,
  groupSparklines,
  holdingsView,
  institutionLabel,
  sparklineRows,
  stackGrid,
  toListRow,
  typeLabel,
  type AccountRecord,
} from '../convex/finance/accountModel';
import * as accounts from '../convex/finance/accounts';
import { addDays } from '../convex/finance/dates';
import type { ChartPoint } from '../convex/finance/series';
import { CONVEX_QUERY_READ_BUDGET } from '../convex/finance/validators';

const INDEXES: Record<string, Record<string, string[]>> = {
  accounts: { by_sourceId: ['sourceId'], by_class: ['class'] },
  balance_snapshots: { by_account_asOf: ['accountId', 'asOf'], by_asOf: ['asOf'] },
  transactions: { by_account_date: ['accountId', 'date'], by_sourceId: ['sourceId'] },
  holdings: { by_account_asOf: ['accountId', 'asOf'] },
};

type Row = Record<string, unknown> & { _id: string; _creationTime: number };

/** Minimal indexed reader: counts every document it returns. */
function fakeCtx(tables: Record<string, Row[]>, identity: { subject: string; email?: string } | null) {
  const stats = { reads: 0, unindexed: [] as string[] };
  const db = {
    query(table: string) {
      let rows = [...(tables[table] ?? [])];
      let fields: string[] = [];
      let indexed = false;
      let desc = false;
      const builder = {
        withIndex(name: string, range?: (q: unknown) => unknown) {
          fields = INDEXES[table][name];
          if (!fields) throw new Error(`unknown index ${table}.${name}`);
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
          if (!indexed) stats.unindexed.push(table);
          const keyed = [...rows].sort((a, b) => {
            for (const f of fields) {
              const cmp = String(a[f]).localeCompare(String(b[f]));
              if (cmp !== 0) return cmp;
            }
            return a._creationTime - b._creationTime;
          });
          return desc ? keyed.reverse() : keyed;
        },
        async take(n: number) {
          const out = builder.sorted().slice(0, n);
          stats.reads += out.length;
          return out;
        },
        async unique() {
          const out = builder.sorted();
          if (out.length > 1) throw new Error('not unique');
          stats.reads += out.length;
          return out[0] ?? null;
        },
        async collect() {
          throw new Error('collect() is not allowed in finance account queries');
        },
        async paginate(opts: { numItems: number; cursor: string | null }) {
          const start = opts.cursor ? Number(opts.cursor) : 0;
          const all = builder.sorted();
          const page = all.slice(start, start + opts.numItems);
          stats.reads += page.length;
          const next = start + page.length;
          return { page, isDone: next >= all.length, continueCursor: String(next) };
        },
      };
      return builder;
    },
  };
  return { ctx: { db, auth: { getUserIdentity: async () => identity } }, stats };
}

type Handler = (ctx: unknown, args: unknown) => Promise<unknown>;
const run = (fn: unknown, ctx: unknown, args: unknown) => (fn as { _handler: Handler })._handler(ctx, args);

let id = 0;
const doc = (fields: Record<string, unknown>): Row => ({ _id: `id_${id++}`, _creationTime: id, ...fields });

function account(sourceId: string, cls: string, balance: number, extra: Partial<AccountRecord> = {}): Row {
  return doc({
    sourceId,
    provider: 'plaid',
    class: cls,
    name: sourceId,
    type: cls === 'liability' ? 'loan' : 'depository',
    currentBalance: balance,
    currency: 'USD',
    syncedAt: Date.parse('2026-10-22T18:00:00Z'),
    updatedAt: 1,
    contentHash: 'x',
    ...extra,
  });
}

const ALLOWED = { subject: 'user_1', email: 'john@example.com' };

describe('account list model', () => {
  it('groups by class in a fixed order with signed subtotals', () => {
    const rows = [
      toListRow(account('chk', 'cash', 1_000) as unknown as AccountRecord, null),
      toListRow(account('sav', 'cash', 2_500) as unknown as AccountRecord, null),
      toListRow(account('ira', 'investments', 10_000) as unknown as AccountRecord, null),
      toListRow(account('home', 'real_estate', 500_000) as unknown as AccountRecord, null),
      toListRow(account('mortgage', 'liability', 300_000) as unknown as AccountRecord, null),
      toListRow(account('visa', 'credit', 400) as unknown as AccountRecord, null),
    ];
    const model = groupAccounts(rows);
    expect(model.groups.map((g) => g.key)).toEqual(['cash', 'investments', 'real_estate', 'liability']);
    expect(model.groups[0].subtotal).toBe(3_500);
    expect(model.groups[0].accounts.map((a) => a.sourceId)).toEqual(['sav', 'chk']);
    expect(model.groups[3].subtotal).toBe(-300_400);
    expect(model.total).toBe(3_500 + 10_000 + 500_000 - 300_400);
  });

  it('uses the latest snapshot for balance and last-updated', () => {
    const row = toListRow(account('chk', 'cash', 1_000) as unknown as AccountRecord, {
      asOf: '2026-10-23',
      balance: 1_234,
      source: 'observed',
    });
    expect(row.balance).toBe(1_234);
    expect(row.lastUpdated).toBe('2026-10-23');
    const stale = toListRow(account('chk', 'cash', 1_000) as unknown as AccountRecord, {
      asOf: '2026-01-01',
      balance: 9,
      source: 'observed',
    });
    expect(stale.lastUpdated).toBe('2026-10-22');
  });

  it('labels institution, type and unknown classes', () => {
    expect(institutionLabel('plaid')).toBe('Plaid');
    expect(institutionLabel('plaid', 'Harbor Credit Union')).toBe('Harbor Credit Union');
    expect(institutionLabel('plaid', 'a8f3k2l1m9n0p7q6r5')).toBe('Plaid');
    expect(typeLabel('depository', 'checking')).toBe('Depository · Checking');
    expect(typeLabel('investment', 'ira')).toBe('Investment · IRA');
    expect(groupKeyForClass('crypto')).toBe('other');
  });
});

describe('holdings and transactions helpers', () => {
  it('keeps only the latest holdings date and computes price and % of account', () => {
    const view = holdingsView(
      [
        { symbol: 'VTI', qty: 10, value: 3_000, asOf: '2026-10-22' },
        { symbol: 'BND', qty: 20, value: 1_000, asOf: '2026-10-22' },
        { symbol: 'OLD', qty: 1, value: 99_999, asOf: '2026-09-01' },
      ],
      5_000,
    );
    expect(view.asOf).toBe('2026-10-22');
    expect(view.rows.map((r) => r.symbol)).toEqual(['VTI', 'BND']);
    expect(view.rows[0].price).toBe(300);
    expect(view.rows[0].pctOfAccount).toBeCloseTo(0.6);
    expect(view.total).toBe(4_000);
  });

  it('signs amounts from the holder view', () => {
    expect(displayAmount(3_820, 'credit')).toBe(3_820);
    expect(displayAmount(84.12, 'debit')).toBe(-84.12);
    expect(displayAmount(50, 'unknown')).toBe(-50);
    expect(displayAmount(-50, 'unknown')).toBe(50);
  });

  it('groups consecutive rows by date and clamps page sizes', () => {
    const groups = groupByDate([{ date: 'b' }, { date: 'b' }, { date: 'a' }]);
    expect(groups.map((g) => [g.date, g.rows.length])).toEqual([
      ['b', 2],
      ['a', 1],
    ]);
    expect(clampPageSize(undefined)).toBe(25);
    expect(clampPageSize(5_000)).toBe(TRANSACTIONS_PAGE_MAX);
    expect(clampPageSize(0)).toBe(1);
  });

  it('builds an unsigned balance history for a liability', () => {
    const history = accountHistory({
      account: account('mortgage', 'liability', 300_000) as unknown as AccountRecord,
      snapshots: [
        { accountId: 'mortgage', asOf: '2026-01-01', balance: 310_000, source: 'manual' },
        { accountId: 'mortgage', asOf: '2026-10-22', balance: 300_000, source: 'manual' },
      ],
      range: 'YTD',
      asOf: '2026-10-22',
    });
    expect(history.points[0].total).toBe(310_000);
    expect(history.points.at(-1)?.total).toBe(300_000);
    expect(history.change).toBe(-10_000);
  });
});

describe('sparkline model', () => {
  it('treats a shrinking liability as good and a shrinking asset as bad', () => {
    expect(changeTone('liability', -500)).toBe('good');
    expect(changeTone('credit', 120)).toBe('bad');
    expect(changeTone('loan', -1)).toBe('good');
    expect(changeTone('investments', 900)).toBe('good');
    expect(changeTone('cash', -50)).toBe('bad');
    expect(changeTone('cash', 0)).toBe('flat');
  });

  it('leaves dates before coverage empty and measures change from the first covered point', () => {
    const [loan, brk] = sparklineRows({
      accounts: [
        { sourceId: 'loan', class: 'liability' },
        { sourceId: 'brk', class: 'investments' },
      ],
      snapshots: [
        { accountId: 'loan', asOf: '2026-01-01', balance: 10_000, source: 'manual' },
        { accountId: 'loan', asOf: '2026-01-21', balance: 8_000, source: 'manual' },
        { accountId: 'brk', asOf: '2026-01-11', balance: 1_000, source: 'observed' },
        { accountId: 'brk', asOf: '2026-01-21', balance: 1_250, source: 'observed' },
      ],
      dates: ['2026-01-01', '2026-01-11', '2026-01-21', '2026-01-31'],
    });
    expect(loan.values).toEqual([10_000, 9_000, 8_000, 8_000]);
    expect(loan.change).toBe(-2_000);
    expect(loan.changePct).toBeCloseTo(-0.2);
    expect(loan.tone).toBe('good');
    expect(brk.values).toEqual([null, 1_000, 1_250, 1_250]);
    expect(brk.changePct).toBeCloseTo(0.25);
    expect(brk.tone).toBe('good');
  });

  it('returns an empty line and no percent for an account without snapshots', () => {
    const [row] = sparklineRows({
      accounts: [{ sourceId: 'new', class: 'cash' }],
      snapshots: [],
      dates: ['2026-01-01', '2026-01-02'],
    });
    expect(row.values).toEqual([null, null]);
    expect(row.changePct).toBeNull();
    expect(row.tone).toBe('flat');
  });
});

describe('group sparklines and chart filter', () => {
  it('sums account lines per group in Cash, Investments, Property, Loans order', () => {
    const accountsIn = [
      { sourceId: 'visa', class: 'credit' },
      { sourceId: 'chk', class: 'cash' },
      { sourceId: 'home', class: 'real_estate' },
      { sourceId: 'sav', class: 'depository' },
      { sourceId: 'brk', class: 'investments' },
      { sourceId: 'loan', class: 'liability' },
    ];
    const row = (sourceId: string, values: Array<number | null>) => ({
      sourceId,
      values,
      change: 0,
      changePct: null,
      tone: 'flat' as const,
    });
    const groups = groupSparklines(accountsIn, [
      row('visa', [null, 500, 1_000]),
      row('loan', [9_000, 8_000, 7_000]),
      row('chk', [100, 200, 300]),
      row('sav', [null, null, 700]),
      row('brk', [1_000, 1_000, 1_000]),
      row('home', [500_000, 500_000, 500_000]),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['cash', 'investments', 'real_estate', 'liability']);
    const [cash, , home, loans] = groups;
    expect(cash.values).toEqual([100, 200, 1_000]);
    expect(cash.tone).toBe('good');
    expect(home.tone).toBe('flat');
    expect(loans.values).toEqual([9_000, 8_500, 8_000]);
    expect(loans.changePct).toBeCloseTo(-1_000 / 9_000);
    expect(loans.tone).toBe('good');
  });

  it('filters chart points to one group, trimming dates before it has data', () => {
    const points: ChartPoint[] = [
      { asOf: '2026-01-01', total: 100, interpolated: false, byClass: { cash: 100 } },
      { asOf: '2026-02-01', total: 600, interpolated: false, byClass: { cash: 200, investments: 400 } },
      { asOf: '2026-03-01', total: -300, interpolated: true, byClass: { cash: 300, investments: 500, credit: -100, liability: -1_000 } },
    ];
    const inv = groupChartPoints(points, 'investments');
    expect(inv.map((p) => [p.asOf, p.total])).toEqual([
      ['2026-02-01', 400],
      ['2026-03-01', 500],
    ]);
    const loans = groupChartPoints(points, 'liability');
    expect(loans).toHaveLength(1);
    expect(loans[0].total).toBe(1_100);
    expect(loans[0].interpolated).toBe(true);
    expect(groupChartPoints(points, 'cash').map((p) => p.total)).toEqual([100, 200, 300]);
  });
});

describe('stack grid', () => {
  it('is weekly for long windows, daily up to 120 days, and clamped to the data', () => {
    const all = stackGrid({ firstAsOf: '2019-01-01', asOf: '2026-10-23' });
    expect(all.step).toBe('week');
    expect(all.dates.length).toBeLessThanOrEqual(STACK_POINTS);
    expect(all.dates[0]).toBe('2019-01-01');
    expect(all.dates.at(-1)).toBe('2026-10-23');

    const month = stackGrid({ firstAsOf: '2019-01-01', asOf: '2026-10-23', from: '2026-09-23', to: '2026-10-23' });
    expect(month.step).toBe('day');
    expect(month.dates).toHaveLength(31);

    const clamped = stackGrid({ firstAsOf: '2026-01-01', asOf: '2026-10-23', from: '2010-01-01', to: '2030-01-01' });
    expect([clamped.from, clamped.to]).toEqual(['2026-01-01', '2026-10-23']);
  });
});

describe('account queries', () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.ALLOWED_EMAILS = 'john@example.com';
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it('rejects signed-out and non-allowlisted callers on every query', async () => {
    const calls: Array<[unknown, unknown]> = [
      [accounts.list, {}],
      [accounts.detail, { sourceId: 'chk' }],
      [accounts.transactions, { sourceId: 'chk', paginationOpts: { numItems: 10, cursor: null } }],
      [accounts.holdings, { sourceId: 'chk' }],
      [accounts.sparklines, { range: '1Y' }],
      [accounts.stack, {}],
    ];
    for (const [fn, args] of calls) {
      await expect(run(fn, fakeCtx({}, null).ctx, args)).rejects.toThrow('Unauthorized');
      await expect(
        run(fn, fakeCtx({}, { subject: 'x', email: 'eve@example.com' }).ctx, args),
      ).rejects.toThrow('Forbidden');
    }
  });

  it('pages transactions newest first through the account/date index', async () => {
    const txns = Array.from({ length: 250 }, (_, i) =>
      doc({
        sourceId: `t${i}`,
        accountId: i % 2 === 0 ? 'chk' : 'other',
        kind: 'cash',
        date: addDays('2026-01-01', i),
        amount: 10 + i,
        direction: 'debit',
        name: `Purchase ${i}`,
        category: 'Shopping',
        pending: false,
        updatedAt: 1,
        contentHash: 'x',
      }),
    );
    const { ctx, stats } = fakeCtx({ transactions: txns }, ALLOWED);
    const first = (await run(accounts.transactions, ctx, {
      sourceId: 'chk',
      paginationOpts: { numItems: 500, cursor: null },
    })) as { page: Array<{ date: string; description: string }>; isDone: boolean; continueCursor: string };
    expect(first.page).toHaveLength(TRANSACTIONS_PAGE_MAX);
    expect(first.page[0].date).toBe(addDays('2026-01-01', 248));
    expect(first.page[0].description).toBe('Purchase 248');
    expect(first.isDone).toBe(false);
    const dates = first.page.map((row) => row.date);
    expect([...dates].sort().reverse()).toEqual(dates);

    const second = (await run(accounts.transactions, ctx, {
      sourceId: 'chk',
      paginationOpts: { numItems: 100, cursor: first.continueCursor },
    })) as { page: unknown[]; isDone: boolean };
    expect(second.page).toHaveLength(25);
    expect(second.isDone).toBe(true);
    expect(stats.unindexed).toEqual([]);
    expect(stats.reads).toBe(125);
  });

  it('loads detail history for 12 years of daily snapshots within the read budget', async () => {
    const snaps: Row[] = [];
    let day = '2014-10-22';
    for (let i = 0; i < 4_400; i += 1) {
      snaps.push(
        doc({ accountId: 'brk', asOf: day, balance: 10_000 + i * 10, source: 'observed', updatedAt: 1, contentHash: 'x' }),
      );
      day = addDays(day, 1);
    }
    const { ctx, stats } = fakeCtx(
      { accounts: [account('brk', 'investments', 54_000, { mask: '6401', subtype: 'brokerage' })], balance_snapshots: snaps },
      ALLOWED,
    );
    for (const range of ['All', '1Y', '1M'] as const) {
      stats.reads = 0;
      const detail = (await run(accounts.detail, ctx, { sourceId: 'brk', range })) as {
        history: { points: Array<{ asOf: string; total: number }> };
        latestSnapshot: { asOf: string };
        mask: string;
      };
      expect(stats.reads).toBeLessThan(CONVEX_QUERY_READ_BUDGET);
      expect(detail.history.points.length).toBeGreaterThan(10);
      expect(detail.history.points.at(-1)?.asOf).toBe(snaps.at(-1)!.asOf);
      expect(detail.latestSnapshot.asOf).toBe(snaps.at(-1)!.asOf);
      expect(detail.mask).toBe('6401');
    }
    expect(stats.unindexed).toEqual([]);
  });

  it('returns null detail for an unknown account', async () => {
    const { ctx } = fakeCtx({ accounts: [] }, ALLOWED);
    expect(await run(accounts.detail, ctx, { sourceId: 'missing' })).toBeNull();
  });

  it('reads only the latest holdings snapshot', async () => {
    const rows = [
      ...Array.from({ length: 300 }, (_, i) =>
        doc({ accountId: 'brk', symbol: `OLD${i}`, qty: 1, value: 1, asOf: '2026-09-01', updatedAt: 1, contentHash: 'x' }),
      ),
      doc({ accountId: 'brk', symbol: 'VTI', qty: 10, value: 3_000, asOf: '2026-10-22', updatedAt: 1, contentHash: 'x' }),
      doc({ accountId: 'brk', symbol: 'BND', qty: 20, value: 1_000, asOf: '2026-10-22', updatedAt: 1, contentHash: 'x' }),
    ];
    const { ctx, stats } = fakeCtx({ holdings: rows }, ALLOWED);
    const view = (await run(accounts.holdings, ctx, { sourceId: 'brk', accountValue: 4_000 })) as {
      rows: Array<{ symbol: string; pctOfAccount: number }>;
    };
    expect(view.rows.map((r) => r.symbol)).toEqual(['VTI', 'BND']);
    expect(view.rows[0].pctOfAccount).toBeCloseTo(0.75);
    expect(stats.reads).toBe(3);
  });

  it('lists accounts grouped with one latest-snapshot read each', async () => {
    const { ctx, stats } = fakeCtx(
      {
        accounts: [account('chk', 'cash', 1_000), account('loan', 'liability', 9_000)],
        balance_snapshots: [
          doc({ accountId: 'chk', asOf: '2026-10-21', balance: 900, source: 'observed', updatedAt: 1, contentHash: 'x' }),
          doc({ accountId: 'chk', asOf: '2026-10-22', balance: 1_100, source: 'observed', updatedAt: 1, contentHash: 'x' }),
        ],
      },
      ALLOWED,
    );
    const model = (await run(accounts.list, ctx, {})) as {
      total: number;
      groups: Array<{ key: string; accounts: Array<{ balance: number }> }>;
    };
    expect(model.groups.map((g) => g.key)).toEqual(['cash', 'liability']);
    expect(model.groups[0].accounts[0].balance).toBe(1_100);
    expect(model.total).toBe(1_100 - 9_000);
    expect(stats.reads).toBe(3);
  });

  it('batches downsampled sparklines that follow the selected range', async () => {
    const snaps: Row[] = [];
    let day = '2024-10-22';
    for (let i = 0; i <= 730; i += 1) {
      snaps.push(doc({ accountId: 'brk', asOf: day, balance: 10_000 + i * 10, source: 'observed', updatedAt: 1, contentHash: 'x' }));
      snaps.push(doc({ accountId: 'loan', asOf: day, balance: 20_000 - i * 10, source: 'observed', updatedAt: 1, contentHash: 'x' }));
      day = addDays(day, 1);
    }
    const { ctx, stats } = fakeCtx(
      { accounts: [account('brk', 'investments', 0), account('loan', 'liability', 0)], balance_snapshots: snaps },
      ALLOWED,
    );
    type Result = {
      asOf: string;
      dates: string[];
      rows: Array<{ sourceId: string; values: Array<number | null>; changePct: number | null; tone: string }>;
      groups: Array<{ key: string; tone: string }>;
      documentsRead: number;
    };
    const year = (await run(accounts.sparklines, ctx, { range: '1Y' })) as Result;
    expect(year.asOf).toBe('2026-10-22');
    expect(year.dates).toHaveLength(SPARKLINE_POINTS);
    expect(year.dates[0]).toBe('2025-10-22');
    expect(year.dates.at(-1)).toBe('2026-10-22');
    const [brk, loan] = year.rows;
    expect(brk.values[0]).toBe(10_000 + 365 * 10);
    expect(brk.values.at(-1)).toBe(10_000 + 730 * 10);
    expect(brk.tone).toBe('good');
    expect(loan.changePct).toBeLessThan(0);
    expect(loan.tone).toBe('good');
    expect(year.groups.map((g) => g.key)).toEqual(['investments', 'liability']);
    expect(year.groups[1].tone).toBe('good');
    expect(stats.reads).toBe(year.documentsRead);
    expect(stats.unindexed.filter((table) => table !== 'accounts')).toEqual([]);

    const month = (await run(accounts.sparklines, ctx, { range: '1M' })) as Result;
    expect(month.dates[0]).toBe('2026-09-22');
    expect(month.dates).toHaveLength(31);
    expect(month.rows[0].changePct).toBeCloseTo(300 / (10_000 + 700 * 10));
  });

  it('keeps sparklines for 200 accounts under the read budget', async () => {
    const list: Row[] = [];
    const snaps: Row[] = [];
    for (let a = 0; a < 200; a += 1) {
      list.push(account(`acc${a}`, a % 5 === 0 ? 'liability' : 'cash', 0));
      let day = '2025-10-22';
      for (let w = 0; w <= 52; w += 1) {
        snaps.push(doc({ accountId: `acc${a}`, asOf: day, balance: 1_000 + w, source: 'observed', updatedAt: 1, contentHash: 'x' }));
        day = addDays(day, 7);
      }
    }
    const { ctx, stats } = fakeCtx({ accounts: list, balance_snapshots: snaps }, ALLOWED);
    const result = (await run(accounts.sparklines, ctx, { range: '1Y' })) as {
      rows: Array<{ values: Array<number | null> }>;
    };
    expect(result.rows).toHaveLength(200);
    expect(stats.reads).toBeLessThan(CONVEX_QUERY_READ_BUDGET);
    for (const row of result.rows) {
      expect(row.values.filter((v) => v != null).length).toBeGreaterThan(SPARKLINE_POINTS / 2);
    }
    expect(stats.unindexed.filter((table) => table !== 'accounts')).toEqual([]);
  });

  it('returns stack data for the full history and a zoomed window within the read budget', async () => {
    const list: Row[] = [];
    const snaps: Row[] = [];
    for (let a = 0; a < 12; a += 1) {
      list.push(account(`acc${a}`, a === 0 ? 'liability' : a % 2 ? 'cash' : 'investments', 0));
      let day = '2016-10-23';
      for (let d = 0; d < 3_650; d += 3) {
        snaps.push(doc({ accountId: `acc${a}`, asOf: day, balance: 1_000 + d, source: 'observed', updatedAt: 1, contentHash: 'x' }));
        day = addDays(day, 3);
      }
    }
    const { ctx, stats } = fakeCtx({ accounts: list, balance_snapshots: snaps }, ALLOWED);
    type Stack = {
      from: string;
      to: string;
      step: string;
      dates: string[];
      accounts: Array<{ sourceId: string; group: string; values: Array<number | null> }>;
    };
    const overview = (await run(accounts.stack, ctx, {})) as Stack;
    expect(stats.reads).toBeLessThan(CONVEX_QUERY_READ_BUDGET);
    expect(overview.step).toBe('week');
    expect(overview.from).toBe('2016-10-23');
    expect(overview.accounts).toHaveLength(12);
    expect(overview.accounts[0].group).toBe('liability');
    expect(overview.accounts[1].values.every((v) => v != null)).toBe(true);

    stats.reads = 0;
    const zoom = (await run(accounts.stack, ctx, { from: '2026-06-01', to: '2026-07-01' })) as Stack;
    expect(stats.reads).toBeLessThan(CONVEX_QUERY_READ_BUDGET);
    expect(zoom.step).toBe('day');
    expect(zoom.dates[0]).toBe('2026-06-01');
    expect(zoom.dates).toHaveLength(31);
    expect(stats.unindexed.filter((table) => table !== 'accounts')).toEqual([]);

    await expect(run(accounts.stack, ctx, { from: 'June' })).rejects.toThrow('Invalid date');
  });
});
