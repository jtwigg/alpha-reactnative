import { describe, expect, it } from 'vitest';
import { addDays, addMonths, eachDate, eachMonth, monthEnd, monthStart } from '../convex/finance/dates';
import { bucketHash } from '../convex/finance/hash';
import {
  applyExportCursor,
  collectDigestPage,
  fillGapsWindow,
  memoryDigestSource,
  rowsInDateRange,
  takeThenFilter,
  type DigestCursor,
} from '../convex/finance/scan';
import { CONVEX_QUERY_READ_BUDGET, FILL_GAPS_READ_CAP } from '../convex/finance/validators';

const ACCOUNT = 'acc_big';
/** 1-indexed day 4000 lands on 2025-02-16 so take(4000) clips mid-February. */
const CUTOVER = '2025-02-16';
const START = addDays(CUTOVER, -3999);
const DAYS = 4613;
const END = addDays(START, DAYS - 1);

function buildSnapshots() {
  const dates = eachDate(START, END);
  return dates.map((asOf, index) => ({
    accountId: ACCOUNT,
    asOf,
    balance: 1000 + index,
    contentHash: `h${asOf}`,
  }));
}

describe('indexed range vs take(4000)', () => {
  const snapshots = buildSnapshots();

  it('builds 4613 daily rows with the 4000th on 2025-02-16', () => {
    expect(snapshots).toHaveLength(4613);
    expect(snapshots[0].asOf).toBe(START);
    expect(snapshots[3999].asOf).toBe(CUTOVER);
    expect(snapshots[snapshots.length - 1].asOf).toBe(END);
    expect(END >= '2026-07-31').toBe(true);
  });

  it('does not drop late months when from/to are applied on the index', () => {
    const dateOf = (row: { asOf: string }) => row.asOf;
    const feb = { from: '2025-02-01', to: monthEnd('2025-02') };
    const jul = { from: '2026-07-01', to: monthEnd('2026-07') };

    expect(takeThenFilter(snapshots, dateOf, 4000, feb.from, feb.to)).toHaveLength(16);
    expect(rowsInDateRange(snapshots, dateOf, feb.from, feb.to)).toHaveLength(28);

    expect(takeThenFilter(snapshots, dateOf, 4000, jul.from, jul.to)).toHaveLength(0);
    expect(rowsInDateRange(snapshots, dateOf, jul.from, jul.to)).toHaveLength(31);
  });
});

describe('digest pagination for a 4613-row account', () => {
  const snapshots = buildSnapshots();
  const source = memoryDigestSource({
    accounts: [
      {
        sourceId: ACCOUNT,
        syncedAt: Date.parse(`${END}T00:00:00.000Z`),
        currentBalance: 1,
        contentHash: 'acc',
      },
    ],
    snapshots,
  });

  it('returns the full 2026-07 bucket when from/to are set', async () => {
    const page = await collectDigestPage(source, {
      tables: ['balance_snapshots'],
      accountId: ACCOUNT,
      fromDate: '2026-07-01',
      toDate: monthEnd('2026-07'),
      cursor: null,
      limit: 10,
      readBudget: CONVEX_QUERY_READ_BUDGET,
      hash: bucketHash,
    });
    expect(page.buckets).toHaveLength(1);
    expect(page.buckets[0]).toMatchObject({
      table: 'balance_snapshots',
      accountId: ACCOUNT,
      month: '2026-07',
      count: 31,
    });
    expect(page.isDone).toBe(true);
    expect(page.documentsRead).toBeLessThan(CONVEX_QUERY_READ_BUDGET);
  });

  it('pages a whole-table digest under the Convex read budget', async () => {
    const seen = new Map<string, number>();
    let cursor: DigestCursor | null = null;
    let pages = 0;
    let done = false;
    while (!done) {
      const page = await collectDigestPage(source, {
        tables: ['balance_snapshots'],
        accountId: ACCOUNT,
        cursor,
        limit: 20,
        readBudget: CONVEX_QUERY_READ_BUDGET,
        hash: bucketHash,
      });
      expect(page.documentsRead).toBeLessThanOrEqual(CONVEX_QUERY_READ_BUDGET);
      for (const bucket of page.buckets) {
        seen.set(bucket.month, bucket.count);
      }
      pages += 1;
      done = page.isDone;
      cursor = page.continueCursor;
      expect(pages).toBeLessThan(20);
    }

    const months = eachMonth(monthStart(START), monthEnd(END));
    expect(seen.size).toBe(months.length);
    expect(seen.get('2025-02')).toBe(28);
    expect(seen.get('2026-07')).toBe(31);
    let total = 0;
    for (const count of seen.values()) total += count;
    expect(total).toBe(4613);
  });
});

describe('export_bucket cursor', () => {
  it('pages a month without scanning the whole account', () => {
    const monthRows = eachDate('2026-07-01', '2026-07-31').map((asOf, index) => ({
      asOf,
      _id: `id_${String(index).padStart(2, '0')}`,
    }));
    const first = applyExportCursor(
      monthRows,
      (row) => row.asOf,
      (row) => row._id,
      null,
      10,
    );
    expect(first.page).toHaveLength(10);
    expect(first.isDone).toBe(false);
    expect(first.continueCursor).toEqual({ date: '2026-07-10', id: 'id_09' });

    const second = applyExportCursor(
      monthRows.filter((row) => row.asOf >= first.continueCursor!.date),
      (row) => row.asOf,
      (row) => row._id,
      first.continueCursor,
      10,
    );
    expect(second.page[0].asOf).toBe('2026-07-11');
    expect(second.page).toHaveLength(10);
  });
});

describe('fillGaps window', () => {
  it('splits a 4613-day range so collect stays under the read cap', () => {
    const window = fillGapsWindow(START, END, FILL_GAPS_READ_CAP);
    expect(window.windowTo).toBe(addDays(START, FILL_GAPS_READ_CAP - 1));
    expect(window.continueFrom).toBe(addDays(START, FILL_GAPS_READ_CAP));
    expect(eachDate(START, window.windowTo).length).toBe(FILL_GAPS_READ_CAP);
  });

  it('does not split a short range', () => {
    expect(fillGapsWindow('2026-07-01', '2026-07-31', FILL_GAPS_READ_CAP)).toEqual({
      windowTo: '2026-07-31',
      continueFrom: null,
    });
  });
});

describe('eachMonth', () => {
  it('walks inclusive month keys', () => {
    expect(eachMonth('2026-07', '2026-10')).toEqual([
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
    expect(addMonths('2026-12', 1)).toBe('2027-01');
  });
});
