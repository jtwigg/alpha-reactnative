import {
  addDays,
  addMonths,
  daysBetween,
  eachMonth,
  monthEnd,
  monthOf,
  monthStart,
} from './dates';
import type { FinanceTable } from './hash';
import { formatFixedSum } from './lib';

export const TABLE_ORDER: FinanceTable[] = [
  'accounts',
  'balance_snapshots',
  'transactions',
  'holdings',
];

export type DateIndexedTable = Exclude<FinanceTable, 'accounts' | 'flows' | 'returns' | 'series'>;

export const TABLE_DATE_FIELD: Record<DateIndexedTable, 'asOf' | 'date'> = {
  balance_snapshots: 'asOf',
  transactions: 'date',
  holdings: 'asOf',
};

export const TABLE_DATE_INDEX: Record<DateIndexedTable, string> = {
  balance_snapshots: 'by_account_asOf',
  transactions: 'by_account_date',
  holdings: 'by_account_asOf',
};

export type DigestCursor = {
  table?: FinanceTable;
  accountId?: string;
  month?: string;
};

export type DigestRow = {
  contentHash: string;
  amount: number;
};

export type DigestBucket = {
  table: FinanceTable;
  accountId: string;
  month: string;
  count: number;
  sum: string;
  bucketHash: string;
};

export function bucketKey(table: FinanceTable, accountId: string, month: string) {
  return `${table}|${accountId}|${month}`;
}

export function afterCursor(
  table: FinanceTable,
  accountId: string,
  month: string,
  cursor: DigestCursor | null,
): boolean {
  if (!cursor?.table) return true;
  return (
    bucketKey(table, accountId, month) >
    `${cursor.table}|${cursor.accountId ?? ''}|${cursor.month ?? ''}`
  );
}

export function rowsInDateRange<T>(
  rows: readonly T[],
  dateOf: (row: T) => string,
  fromDate?: string,
  toDate?: string,
): T[] {
  return rows.filter((row) => {
    const date = dateOf(row);
    if (fromDate && date < fromDate) return false;
    if (toDate && date > toDate) return false;
    return true;
  });
}

/** Old digest bug: prefix-take, then filter. Later months go missing. */
export function takeThenFilter<T>(
  rows: readonly T[],
  dateOf: (row: T) => string,
  take: number,
  fromDate?: string,
  toDate?: string,
): T[] {
  return rowsInDateRange(rows.slice(0, take), dateOf, fromDate, toDate);
}

/** Inclusive day window so one fillGaps call stays under Convex read limits. */
export function fillGapsWindow(
  from: string,
  to: string,
  cap: number,
): { windowTo: string; continueFrom: string | null } {
  if (to < from) return { windowTo: from, continueFrom: null };
  const inclusiveDays = daysBetween(from, to) + 1;
  if (inclusiveDays <= cap) return { windowTo: to, continueFrom: null };
  const windowTo = addDays(from, cap - 1);
  return { windowTo, continueFrom: addDays(windowTo, 1) };
}

export type ExportCursor = { date: string; id: string };

export function decodeExportCursor(cursor?: string): ExportCursor | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(cursor) as Partial<ExportCursor>;
    if (parsed && typeof parsed.date === 'string' && typeof parsed.id === 'string') {
      return { date: parsed.date, id: parsed.id };
    }
  } catch {
    // legacy raw _id from the first MCP export pages
  }
  return { date: '', id: cursor };
}

export function applyExportCursor<T>(
  rows: readonly T[],
  dateOf: (row: T) => string,
  idOf: (row: T) => string,
  after: ExportCursor | null,
  limit: number,
): { page: T[]; continueCursor: ExportCursor | null; isDone: boolean } {
  const filtered = [...rows].filter((row) => {
    if (!after) return true;
    const date = dateOf(row);
    const id = idOf(row);
    if (after.date) {
      if (date < after.date) return false;
      if (date === after.date && id <= after.id) return false;
      return true;
    }
    return id > after.id;
  });
  filtered.sort((a, b) => {
    const byDate = dateOf(a).localeCompare(dateOf(b));
    if (byDate !== 0) return byDate;
    return idOf(a).localeCompare(idOf(b));
  });
  const page = filtered.slice(0, limit);
  const last = page[page.length - 1];
  const isDone = filtered.length <= limit;
  return {
    page,
    continueCursor:
      !isDone && last ? { date: dateOf(last), id: idOf(last) } : null,
    isDone,
  };
}

export function exportIndexStart(
  month: string,
  after: ExportCursor | null,
): string {
  const start = monthStart(month);
  if (after?.date && after.date > start) return after.date;
  return start;
}

export type DigestSource = {
  listAccountIds: (accountId?: string) => Promise<string[]>;
  loadAccountBucket: (accountId: string) => Promise<{
    month: string;
    amount: number;
    contentHash: string;
  } | null>;
  firstDate: (
    table: DateIndexedTable,
    accountId: string,
    fromDate?: string,
    toDate?: string,
  ) => Promise<string | null>;
  lastDate: (
    table: DateIndexedTable,
    accountId: string,
    fromDate?: string,
    toDate?: string,
  ) => Promise<string | null>;
  rowsInMonth: (
    table: DateIndexedTable,
    accountId: string,
    month: string,
  ) => Promise<DigestRow[]>;
};

export async function collectDigestPage(
  source: DigestSource,
  args: {
    tables: FinanceTable[];
    accountId?: string;
    fromDate?: string;
    toDate?: string;
    cursor: DigestCursor | null;
    limit: number;
    readBudget: number;
    hash: (hashes: string[]) => Promise<string>;
  },
): Promise<{
  buckets: DigestBucket[];
  continueCursor: DigestCursor | null;
  isDone: boolean;
  documentsRead: number;
}> {
  const accountIds = await source.listAccountIds(args.accountId);
  const buckets: DigestBucket[] = [];
  let documentsRead = 0;
  let lastEmitted: DigestCursor | null = null;
  let stoppedEarly = false;

  const emit = async (
    table: FinanceTable,
    accountId: string,
    month: string,
    rows: DigestRow[],
  ) => {
    buckets.push({
      table,
      accountId,
      month,
      count: rows.length,
      sum: formatFixedSum(rows.map((row) => row.amount)),
      bucketHash: await args.hash(rows.map((row) => row.contentHash)),
    });
    lastEmitted = { table, accountId, month };
  };

  tableLoop: for (const table of args.tables) {
    for (const accountId of accountIds) {
      if (buckets.length >= args.limit || documentsRead >= args.readBudget) {
        stoppedEarly = true;
        break tableLoop;
      }

      if (table === 'flows' || table === 'returns' || table === 'series') continue;
      if (table === 'accounts') {
        const account = await source.loadAccountBucket(accountId);
        documentsRead += 1;
        if (!account) continue;
        if (args.fromDate && `${account.month}-01` < monthStart(args.fromDate)) {
          continue;
        }
        if (args.toDate && `${account.month}-01` > monthStart(args.toDate)) {
          continue;
        }
        if (!afterCursor(table, accountId, account.month, args.cursor)) {
          continue;
        }
        await emit(table, accountId, account.month, [
          { contentHash: account.contentHash, amount: account.amount },
        ]);
        continue;
      }

      const dated = table as DateIndexedTable;
      const first = await source.firstDate(
        dated,
        accountId,
        args.fromDate,
        args.toDate,
      );
      const last = await source.lastDate(
        dated,
        accountId,
        args.fromDate,
        args.toDate,
      );
      documentsRead += 2;
      if (!first || !last) continue;

      let month = monthOf(first);
      const endMonth = monthOf(last);
      if (
        args.cursor?.table === table &&
        args.cursor.accountId === accountId &&
        args.cursor.month
      ) {
        const resume = addMonths(args.cursor.month, 1);
        if (resume > month) month = resume;
      }

      for (const current of eachMonth(month, endMonth)) {
        if (!afterCursor(table, accountId, current, args.cursor)) continue;
        if (buckets.length >= args.limit || documentsRead >= args.readBudget) {
          stoppedEarly = true;
          break tableLoop;
        }
        const rows = await source.rowsInMonth(dated, accountId, current);
        documentsRead += rows.length;
        if (rows.length === 0) continue;
        await emit(table, accountId, current, rows);
      }
    }
  }

  return {
    buckets,
    continueCursor: stoppedEarly ? lastEmitted : null,
    isDone: !stoppedEarly,
    documentsRead,
  };
}

export type SeriesDigestSource = {
  listScopes: (scope?: string) => Promise<string[]>;
  firstDate: (scope: string, fromDate?: string, toDate?: string) => Promise<string | null>;
  lastDate: (scope: string, fromDate?: string, toDate?: string) => Promise<string | null>;
  rowsInMonth: (scope: string, month: string) => Promise<DigestRow[]>;
};

/** Series digest buckets keyed (table=series, accountId=scope, month). */
export async function collectSeriesDigestPage(
  source: SeriesDigestSource,
  args: {
    scope?: string;
    fromDate?: string;
    toDate?: string;
    cursor: DigestCursor | null;
    limit: number;
    readBudget: number;
    hash: (hashes: string[]) => Promise<string>;
  },
): Promise<{
  buckets: DigestBucket[];
  continueCursor: DigestCursor | null;
  isDone: boolean;
  documentsRead: number;
  rowHashes: string[];
}> {
  const scopes = await source.listScopes(args.scope);
  const buckets: DigestBucket[] = [];
  const rowHashes: string[] = [];
  let documentsRead = 0;
  let lastEmitted: DigestCursor | null = null;
  let stoppedEarly = false;

  scopeLoop: for (const scope of scopes) {
    if (buckets.length >= args.limit || documentsRead >= args.readBudget) {
      stoppedEarly = true;
      break;
    }
    const first = await source.firstDate(scope, args.fromDate, args.toDate);
    const last = await source.lastDate(scope, args.fromDate, args.toDate);
    documentsRead += 2;
    if (!first || !last) continue;
    let month = monthOf(first);
    const endMonth = monthOf(last);
    if (args.cursor?.table === 'series' && args.cursor.accountId === scope && args.cursor.month) {
      const resume = addMonths(args.cursor.month, 1);
      if (resume > month) month = resume;
    }
    for (const current of eachMonth(month, endMonth)) {
      if (!afterCursor('series', scope, current, args.cursor)) continue;
      if (buckets.length >= args.limit || documentsRead >= args.readBudget) {
        stoppedEarly = true;
        break scopeLoop;
      }
      const rows = await source.rowsInMonth(scope, current);
      documentsRead += rows.length;
      if (rows.length === 0) continue;
      buckets.push({
        table: 'series',
        accountId: scope,
        month: current,
        count: rows.length,
        sum: formatFixedSum(rows.map((row) => row.amount)),
        bucketHash: await args.hash(rows.map((row) => row.contentHash)),
      });
      lastEmitted = { table: 'series', accountId: scope, month: current };
      for (const row of rows) rowHashes.push(row.contentHash);
    }
  }

  return {
    buckets,
    continueCursor: stoppedEarly ? lastEmitted : null,
    isDone: !stoppedEarly,
    documentsRead,
    rowHashes,
  };
}

export function memorySeriesDigestSource(
  rows: Array<{ scope: string; date: string; value: number; contentHash: string }>,
): SeriesDigestSource {
  const sorted = [...rows].sort((a, b) => {
    const byScope = a.scope.localeCompare(b.scope);
    return byScope !== 0 ? byScope : a.date.localeCompare(b.date);
  });
  const inRange = (scope: string, fromDate?: string, toDate?: string) =>
    rowsInDateRange(
      sorted.filter((row) => row.scope === scope),
      (row) => row.date,
      fromDate,
      toDate,
    );
  return {
    async listScopes(scope) {
      if (scope) {
        const aliases = scope === 'total' || scope === 'reliable_subset' || scope.startsWith('account:')
          ? [scope]
          : [scope, `account:${scope}`];
        return aliases.filter((name) => sorted.some((row) => row.scope === name));
      }
      return [...new Set(sorted.map((row) => row.scope))].sort();
    },
    async firstDate(scope, fromDate, toDate) {
      return inRange(scope, fromDate, toDate)[0]?.date ?? null;
    },
    async lastDate(scope, fromDate, toDate) {
      const match = inRange(scope, fromDate, toDate);
      return match[match.length - 1]?.date ?? null;
    },
    async rowsInMonth(scope, month) {
      return inRange(scope, monthStart(month), monthEnd(month)).map((row) => ({
        contentHash: row.contentHash,
        amount: row.value,
      }));
    },
  };
}

export function memoryDigestSource(data: {
  accounts?: Array<{
    sourceId: string;
    syncedAt: number;
    currentBalance: number;
    contentHash: string;
  }>;
  snapshots?: Array<{
    accountId: string;
    asOf: string;
    balance: number;
    contentHash: string;
  }>;
  transactions?: Array<{
    accountId: string;
    date: string;
    amount: number;
    contentHash: string;
  }>;
  holdings?: Array<{
    accountId: string;
    asOf: string;
    value: number;
    contentHash: string;
  }>;
}): DigestSource {
  const accounts = data.accounts ?? [];
  const snapshots = [...(data.snapshots ?? [])].sort((a, b) =>
    a.asOf.localeCompare(b.asOf),
  );
  const transactions = [...(data.transactions ?? [])].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const holdings = [...(data.holdings ?? [])].sort((a, b) =>
    a.asOf.localeCompare(b.asOf),
  );

  const rowsFor = (table: DateIndexedTable) => {
    if (table === 'balance_snapshots') {
      return snapshots.map((row) => ({
        accountId: row.accountId,
        date: row.asOf,
        amount: row.balance,
        contentHash: row.contentHash,
      }));
    }
    if (table === 'transactions') {
      return transactions.map((row) => ({
        accountId: row.accountId,
        date: row.date,
        amount: row.amount,
        contentHash: row.contentHash,
      }));
    }
    return holdings.map((row) => ({
      accountId: row.accountId,
      date: row.asOf,
      amount: row.value,
      contentHash: row.contentHash,
    }));
  };

  return {
    async listAccountIds(accountId) {
      if (accountId) return [accountId];
      const ids = new Set<string>();
      for (const row of accounts) ids.add(row.sourceId);
      return [...ids].sort();
    },
    async loadAccountBucket(accountId) {
      const row = accounts.find((item) => item.sourceId === accountId);
      if (!row) return null;
      return {
        month: new Date(row.syncedAt).toISOString().slice(0, 7),
        amount: row.currentBalance,
        contentHash: row.contentHash,
      };
    },
    async firstDate(table, accountId, fromDate, toDate) {
      const rows = rowsInDateRange(
        rowsFor(table).filter((row) => row.accountId === accountId),
        (row) => row.date,
        fromDate,
        toDate,
      );
      return rows[0]?.date ?? null;
    },
    async lastDate(table, accountId, fromDate, toDate) {
      const rows = rowsInDateRange(
        rowsFor(table).filter((row) => row.accountId === accountId),
        (row) => row.date,
        fromDate,
        toDate,
      );
      return rows[rows.length - 1]?.date ?? null;
    },
    async rowsInMonth(table, accountId, month) {
      return rowsInDateRange(
        rowsFor(table).filter((row) => row.accountId === accountId),
        (row) => row.date,
        monthStart(month),
        monthEnd(month),
      ).map((row) => ({ contentHash: row.contentHash, amount: row.amount }));
    },
  };
}
