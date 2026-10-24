import { internalQuery } from '../_generated/server';
import type { QueryCtx } from '../_generated/server';
import { bucketHash } from './hash';
import type { FinanceTable } from './hash';
import {
  isIsoMonth,
  monthEnd,
  monthFromTimestampMs,
  monthStart,
  rangeBounds,
} from './dates';
import { decodeCursor, encodeCursor, formatFixedSum } from './lib';
import {
  collectDigestPage,
  decodeExportCursor,
  applyExportCursor,
  exportIndexStart,
  TABLE_ORDER,
  type DateIndexedTable,
  type DigestCursor,
  type DigestSource,
} from './scan';
import {
  CONVEX_QUERY_READ_BUDGET,
  DIGEST_BUCKET_LIMIT_DEFAULT,
  DIGEST_BUCKET_LIMIT_MAX,
  EXPORT_PAGE_DEFAULT,
  EXPORT_PAGE_MAX,
  digestArgsValidator,
  digestResultValidator,
  exportBucketArgsValidator,
  exportBucketResultValidator,
} from './validators';

function snapBounds(
  q: { eq: (field: 'accountId', value: string) => Record<string, any> },
  accountId: string,
  fromDate?: string,
  toDate?: string,
) {
  const base = q.eq('accountId', accountId);
  if (fromDate && toDate) return base.gte('asOf', fromDate).lte('asOf', toDate);
  if (fromDate) return base.gte('asOf', fromDate);
  if (toDate) return base.lte('asOf', toDate);
  return base;
}

function txnBounds(
  q: { eq: (field: 'accountId', value: string) => Record<string, any> },
  accountId: string,
  fromDate?: string,
  toDate?: string,
) {
  const base = q.eq('accountId', accountId);
  if (fromDate && toDate) return base.gte('date', fromDate).lte('date', toDate);
  if (fromDate) return base.gte('date', fromDate);
  if (toDate) return base.lte('date', toDate);
  return base;
}

async function firstLastDate(
  ctx: QueryCtx,
  table: DateIndexedTable,
  accountId: string,
  fromDate: string | undefined,
  toDate: string | undefined,
  order: 'asc' | 'desc',
): Promise<string | null> {
  if (table === 'balance_snapshots') {
    const rows = await ctx.db
      .query('balance_snapshots')
      .withIndex('by_account_asOf', (q) =>
        snapBounds(q, accountId, fromDate, toDate),
      )
      .order(order)
      .take(1);
    return rows[0]?.asOf ?? null;
  }
  if (table === 'transactions') {
    const rows = await ctx.db
      .query('transactions')
      .withIndex('by_account_date', (q) =>
        txnBounds(q, accountId, fromDate, toDate),
      )
      .order(order)
      .take(1);
    return rows[0]?.date ?? null;
  }
  const rows = await ctx.db
    .query('holdings')
    .withIndex('by_account_asOf', (q) =>
        snapBounds(q, accountId, fromDate, toDate),
    )
    .order(order)
    .take(1);
  return rows[0]?.asOf ?? null;
}

async function monthRows(
  ctx: QueryCtx,
  table: DateIndexedTable,
  accountId: string,
  month: string,
) {
  const fromDate = monthStart(month);
  const toDate = monthEnd(month);
  if (table === 'balance_snapshots') {
    const rows = await ctx.db
      .query('balance_snapshots')
      .withIndex('by_account_asOf', (q) =>
        snapBounds(q, accountId, fromDate, toDate),
      )
      .take(2000);
    return rows.map((row) => ({ contentHash: row.contentHash, amount: row.balance }));
  }
  if (table === 'transactions') {
    const rows = await ctx.db
      .query('transactions')
      .withIndex('by_account_date', (q) =>
        txnBounds(q, accountId, fromDate, toDate),
      )
      .take(2000);
    return rows.map((row) => ({ contentHash: row.contentHash, amount: row.amount }));
  }
  const rows = await ctx.db
    .query('holdings')
    .withIndex('by_account_asOf', (q) =>
        snapBounds(q, accountId, fromDate, toDate),
    )
    .take(2000);
  return rows.map((row) => ({ contentHash: row.contentHash, amount: row.value }));
}

/**
 * Fresh digest buckets for specific (accountId, month) transaction buckets,
 * computed exactly like `digest` so callers can reconcile right after a write.
 */
export async function transactionBucketDigests(
  ctx: QueryCtx,
  buckets: { accountId: string; month: string }[],
) {
  const out = [];
  for (const { accountId, month } of buckets) {
    const rows = await monthRows(ctx, 'transactions', accountId, month);
    out.push({
      table: 'transactions' as const,
      accountId,
      month,
      count: rows.length,
      sum: formatFixedSum(rows.map((row) => row.amount)),
      bucketHash: await bucketHash(rows.map((row) => row.contentHash)),
    });
  }
  return out;
}

function convexDigestSource(ctx: QueryCtx): DigestSource {
  return {
    async listAccountIds(accountId) {
      if (accountId) return [accountId];
      const accounts = await ctx.db.query('accounts').take(500);
      return [...new Set(accounts.map((row) => row.sourceId))].sort();
    },
    async loadAccountBucket(accountId) {
      const row = await ctx.db
        .query('accounts')
        .withIndex('by_sourceId', (q) => q.eq('sourceId', accountId))
        .unique();
      if (!row) return null;
      return {
        month: monthFromTimestampMs(row.syncedAt),
        amount: row.currentBalance,
        contentHash: row.contentHash,
      };
    },
    firstDate: (table, accountId, fromDate, toDate) =>
      firstLastDate(ctx, table, accountId, fromDate, toDate, 'asc'),
    lastDate: (table, accountId, fromDate, toDate) =>
      firstLastDate(ctx, table, accountId, fromDate, toDate, 'desc'),
    rowsInMonth: (table, accountId, month) =>
      monthRows(ctx, table, accountId, month),
  };
}

/**
 * Per (table, accountId, YYYY-MM) digest for admin reconciliation.
 *
 *   npx convex run finance/sync:digest '{"from":"2026-07","to":"2026-10"}'
 *
 * Walks indexed (accountId, asOf/date) ranges one month at a time and
 * pages across accounts/buckets so a single call stays under Convex's
 * document-read limit. `bucketHash` = SHA-256 of that bucket's row
 * `contentHash` values sorted lexicographically and joined by `\n`.
 */
export const digest = internalQuery({
  args: digestArgsValidator,
  returns: digestResultValidator,
  handler: async (ctx, args) => {
    const limit = Math.min(
      Math.max(args.limit ?? DIGEST_BUCKET_LIMIT_DEFAULT, 1),
      DIGEST_BUCKET_LIMIT_MAX,
    );
    const bounds = rangeBounds(args.from, args.to);
    const cursor = decodeCursor<DigestCursor>(args.cursor);
    const tables = args.table ? [args.table as FinanceTable] : TABLE_ORDER;
    const page = await collectDigestPage(convexDigestSource(ctx), {
      tables,
      accountId: args.accountId,
      fromDate: bounds.fromDate,
      toDate: bounds.toDate,
      cursor,
      limit,
      readBudget: CONVEX_QUERY_READ_BUDGET,
      hash: bucketHash,
    });
    return {
      buckets: page.buckets,
      continueCursor: page.continueCursor
        ? encodeCursor(page.continueCursor)
        : null,
      isDone: page.isDone,
    };
  },
});

function exportLimit(limit?: number): number {
  return Math.min(Math.max(limit ?? EXPORT_PAGE_DEFAULT, 1), EXPORT_PAGE_MAX);
}

/**
 * Page full rows for one (table, accountId, YYYY-MM) bucket.
 *
 *   npx convex run finance/sync:exportBucket '{"table":"balance_snapshots","accountId":"acc_1","month":"2026-07"}'
 */
export const exportBucket = internalQuery({
  args: exportBucketArgsValidator,
  returns: exportBucketResultValidator,
  handler: async (ctx, args) => {
    if (!isIsoMonth(args.month)) {
      throw new Error('exportBucket: month must be YYYY-MM');
    }
    const limit = exportLimit(args.limit);
    const end = monthEnd(args.month);
    const after = decodeExportCursor(args.cursor);
    const indexStart = exportIndexStart(args.month, after);

    if (args.table === 'accounts') {
      const row = await ctx.db
        .query('accounts')
        .withIndex('by_sourceId', (q) => q.eq('sourceId', args.accountId))
        .unique();
      if (!row || monthFromTimestampMs(row.syncedAt) !== args.month) {
        return { rows: [], continueCursor: null, isDone: true };
      }
      return {
        rows: [
          {
            table: 'accounts' as const,
            _id: row._id,
            contentHash: row.contentHash,
            updatedAt: row.updatedAt,
            sourceId: row.sourceId,
            accountId: row.sourceId,
            provider: row.provider,
            connectionId: row.connectionId,
            class: row.class,
            name: row.name,
            mask: row.mask,
            type: row.type,
            subtype: row.subtype,
            currentBalance: row.currentBalance,
            availableBalance: row.availableBalance,
            currency: row.currency,
            syncedAt: row.syncedAt,
            coverageStart: row.coverageStart,
          },
        ],
        continueCursor: null,
        isDone: true,
      };
    }

    if (args.table === 'balance_snapshots') {
      const rows = await ctx.db
        .query('balance_snapshots')
        .withIndex('by_account_asOf', (q) =>
          q.eq('accountId', args.accountId).gte('asOf', indexStart).lte('asOf', end),
        )
        .take(Math.min(2000, limit + 200));
      const paged = applyExportCursor(
        rows,
        (row) => row.asOf,
        (row) => row._id,
        after,
        limit,
      );
      const last = paged.page[paged.page.length - 1];
      return {
        rows: paged.page.map((row) => ({
          table: 'balance_snapshots' as const,
          _id: row._id,
          contentHash: row.contentHash,
          updatedAt: row.updatedAt,
          source: row.source,
          accountId: row.accountId,
          accountName: row.accountName,
          class: row.class,
          asOf: row.asOf,
          balance: row.balance,
          method: row.method,
        })),
        continueCursor:
          !paged.isDone && last
            ? encodeCursor({ date: last.asOf, id: last._id })
            : null,
        isDone: paged.isDone,
      };
    }

    if (args.table === 'transactions') {
      const rows = await ctx.db
        .query('transactions')
        .withIndex('by_account_date', (q) =>
          q.eq('accountId', args.accountId).gte('date', indexStart).lte('date', end),
        )
        .take(Math.min(2000, limit + 200));
      const paged = applyExportCursor(
        rows,
        (row) => row.date,
        (row) => row._id,
        after,
        limit,
      );
      const last = paged.page[paged.page.length - 1];
      return {
        rows: paged.page.map((row) => ({
          table: 'transactions' as const,
          _id: row._id,
          contentHash: row.contentHash,
          updatedAt: row.updatedAt,
          sourceId: row.sourceId,
          accountId: row.accountId,
          kind: row.kind,
          date: row.date,
          amount: row.amount,
          direction: row.direction,
          name: row.name,
          merchant: row.merchant,
          category: row.category,
          pending: row.pending,
        })),
        continueCursor:
          !paged.isDone && last
            ? encodeCursor({ date: last.date, id: last._id })
            : null,
        isDone: paged.isDone,
      };
    }

    const rows = await ctx.db
      .query('holdings')
      .withIndex('by_account_asOf', (q) =>
        q.eq('accountId', args.accountId).gte('asOf', indexStart).lte('asOf', end),
      )
      .take(Math.min(2000, limit + 200));
    const paged = applyExportCursor(
      rows,
      (row) => row.asOf,
      (row) => row._id,
      after,
      limit,
    );
    const last = paged.page[paged.page.length - 1];
    return {
      rows: paged.page.map((row) => ({
        table: 'holdings' as const,
        _id: row._id,
        contentHash: row.contentHash,
        updatedAt: row.updatedAt,
        accountId: row.accountId,
        symbol: row.symbol,
        qty: row.qty,
        value: row.value,
        asOf: row.asOf,
      })),
      continueCursor:
        !paged.isDone && last
          ? encodeCursor({ date: last.asOf, id: last._id })
          : null,
      isDone: paged.isDone,
    };
  },
});
