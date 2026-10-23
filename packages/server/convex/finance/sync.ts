import { internalQuery } from '../_generated/server';
import type { QueryCtx } from '../_generated/server';
import { bucketHash } from './hash';
import type { FinanceTable } from './hash';
import {
  isIsoMonth,
  monthEnd,
  monthFromTimestampMs,
  monthInRange,
  monthOf,
  monthStart,
  rangeBounds,
} from './dates';
import { decodeCursor, encodeCursor, formatFixedSum } from './lib';
import {
  DIGEST_BUCKET_LIMIT_DEFAULT,
  DIGEST_BUCKET_LIMIT_MAX,
  EXPORT_PAGE_DEFAULT,
  EXPORT_PAGE_MAX,
  digestArgsValidator,
  digestResultValidator,
  exportBucketArgsValidator,
  exportBucketResultValidator,
} from './validators';

type DigestCursor = {
  table?: FinanceTable;
  accountId?: string;
  month?: string;
};

const TABLE_ORDER: FinanceTable[] = [
  'accounts',
  'balance_snapshots',
  'transactions',
  'holdings',
];

type BucketAcc = {
  table: FinanceTable;
  accountId: string;
  month: string;
  hashes: string[];
  amounts: number[];
};

function bucketKey(table: FinanceTable, accountId: string, month: string) {
  return `${table}|${accountId}|${month}`;
}

function afterCursor(
  table: FinanceTable,
  accountId: string,
  month: string,
  cursor: DigestCursor | null,
): boolean {
  if (!cursor?.table) return true;
  const left = `${table}|${accountId}|${month}`;
  const right = `${cursor.table}|${cursor.accountId ?? ''}|${cursor.month ?? ''}`;
  return left > right;
}

async function loadAccountIds(
  ctx: QueryCtx,
  table: FinanceTable | undefined,
  accountId: string | undefined,
): Promise<string[]> {
  if (accountId) return [accountId];
  const ids = new Set<string>();
  const accounts = await ctx.db.query('accounts').take(500);
  for (const row of accounts) ids.add(row.sourceId);
  const needSnapshots =
    !table || table === 'balance_snapshots' || table === 'holdings' || table === 'transactions';
  if (needSnapshots && ids.size === 0) {
    const snaps = await ctx.db.query('balance_snapshots').take(2000);
    for (const row of snaps) ids.add(row.accountId);
    const txns = await ctx.db.query('transactions').take(2000);
    for (const row of txns) ids.add(row.accountId);
    const holds = await ctx.db.query('holdings').take(2000);
    for (const row of holds) ids.add(row.accountId);
  }
  return [...ids].sort();
}

function rowMeta(
  table: FinanceTable,
  row: Record<string, unknown>,
): { accountId: string; month: string; amount: number } {
  if (table === 'accounts') {
    return {
      accountId: String(row.sourceId),
      month: monthFromTimestampMs(Number(row.syncedAt)),
      amount: Number(row.currentBalance),
    };
  }
  if (table === 'balance_snapshots') {
    return {
      accountId: String(row.accountId),
      month: monthOf(String(row.asOf)),
      amount: Number(row.balance),
    };
  }
  if (table === 'transactions') {
    return {
      accountId: String(row.accountId),
      month: monthOf(String(row.date)),
      amount: Number(row.amount),
    };
  }
  return {
    accountId: String(row.accountId),
    month: monthOf(String(row.asOf)),
    amount: Number(row.value),
  };
}

async function rowsForAccount(
  ctx: QueryCtx,
  table: FinanceTable,
  accountId: string,
  fromDate?: string,
  toDate?: string,
): Promise<Array<Record<string, unknown> & { contentHash: string }>> {
  if (table === 'accounts') {
    const row = await ctx.db
      .query('accounts')
      .withIndex('by_sourceId', (q) => q.eq('sourceId', accountId))
      .unique();
    return row ? [row] : [];
  }
  if (table === 'balance_snapshots') {
    const rows = await ctx.db
      .query('balance_snapshots')
      .withIndex('by_account_asOf', (idx) => idx.eq('accountId', accountId))
      .take(4000);
    return rows.filter((row) => {
      if (fromDate && row.asOf < fromDate) return false;
      if (toDate && row.asOf > toDate) return false;
      return true;
    });
  }
  if (table === 'transactions') {
    const rows = await ctx.db
      .query('transactions')
      .withIndex('by_account_date', (idx) => idx.eq('accountId', accountId))
      .take(4000);
    return rows.filter((row) => {
      if (fromDate && row.date < fromDate) return false;
      if (toDate && row.date > toDate) return false;
      return true;
    });
  }
  const rows = await ctx.db
    .query('holdings')
    .withIndex('by_account_asOf', (idx) => idx.eq('accountId', accountId))
    .take(4000);
  return rows.filter((row) => {
    if (fromDate && row.asOf < fromDate) return false;
    if (toDate && row.asOf > toDate) return false;
    return true;
  });
}

/**
 * Per (table, accountId, YYYY-MM) digest for admin reconciliation.
 *
 *   npx convex run finance/sync:digest '{"from":"2026-07","to":"2026-10"}'
 *
 * `bucketHash` = SHA-256 of that bucket's row `contentHash` values sorted
 * lexicographically and joined by `\n` (no trailing newline).
 * `sum` is an 8-decimal string of balance (snapshots), amount
 * (transactions), value (holdings), or currentBalance (accounts).
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
    const tables = args.table ? [args.table] : TABLE_ORDER;
    const accountIds = await loadAccountIds(ctx, args.table, args.accountId);

    const accum = new Map<string, BucketAcc>();
    for (const table of tables) {
      for (const accountId of accountIds) {
        const rows = await rowsForAccount(
          ctx,
          table,
          accountId,
          bounds.fromDate,
          bounds.toDate,
        );
        for (const row of rows) {
          const meta = rowMeta(table, row);
          if (!monthInRange(meta.month, bounds.fromMonth, bounds.toMonth)) {
            continue;
          }
          if (!afterCursor(table, meta.accountId, meta.month, cursor)) {
            continue;
          }
          const key = bucketKey(table, meta.accountId, meta.month);
          const bucket = accum.get(key) ?? {
            table,
            accountId: meta.accountId,
            month: meta.month,
            hashes: [],
            amounts: [],
          };
          bucket.hashes.push(row.contentHash);
          bucket.amounts.push(meta.amount);
          accum.set(key, bucket);
        }
      }
    }

    const sorted = [...accum.values()].sort((a, b) =>
      bucketKey(a.table, a.accountId, a.month).localeCompare(
        bucketKey(b.table, b.accountId, b.month),
      ),
    );
    const page = sorted.slice(0, limit);
    const buckets = [];
    for (const bucket of page) {
      buckets.push({
        table: bucket.table,
        accountId: bucket.accountId,
        month: bucket.month,
        count: bucket.hashes.length,
        sum: formatFixedSum(bucket.amounts),
        bucketHash: await bucketHash(bucket.hashes),
      });
    }
    const last = page[page.length - 1];
    const isDone = sorted.length <= limit;
    return {
      buckets,
      continueCursor:
        !isDone && last
          ? encodeCursor({
              table: last.table,
              accountId: last.accountId,
              month: last.month,
            } satisfies DigestCursor)
          : null,
      isDone,
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
    const start = monthStart(args.month);
    const end = monthEnd(args.month);
    const afterId = args.cursor ?? '';

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
          q.eq('accountId', args.accountId).gte('asOf', start).lte('asOf', end),
        )
        .take(4000);
      const filtered = rows
        .filter((row) => row._id > afterId)
        .sort((a, b) => a._id.localeCompare(b._id));
      const page = filtered.slice(0, limit);
      const last = page[page.length - 1];
      const isDone = filtered.length <= limit;
      return {
        rows: page.map((row) => ({
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
        continueCursor: !isDone && last ? last._id : null,
        isDone,
      };
    }

    if (args.table === 'transactions') {
      const rows = await ctx.db
        .query('transactions')
        .withIndex('by_account_date', (q) =>
          q.eq('accountId', args.accountId).gte('date', start).lte('date', end),
        )
        .take(4000);
      const filtered = rows
        .filter((row) => row._id > afterId)
        .sort((a, b) => a._id.localeCompare(b._id));
      const page = filtered.slice(0, limit);
      const last = page[page.length - 1];
      const isDone = filtered.length <= limit;
      return {
        rows: page.map((row) => ({
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
        continueCursor: !isDone && last ? last._id : null,
        isDone,
      };
    }

    const rows = await ctx.db
      .query('holdings')
      .withIndex('by_account_asOf', (q) =>
        q.eq('accountId', args.accountId).gte('asOf', start).lte('asOf', end),
      )
      .take(4000);
    const filtered = rows
      .filter((row) => row._id > afterId)
      .sort((a, b) => a._id.localeCompare(b._id));
    const page = filtered.slice(0, limit);
    const last = page[page.length - 1];
    const isDone = filtered.length <= limit;
    return {
      rows: page.map((row) => ({
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
      continueCursor: !isDone && last ? last._id : null,
      isDone,
    };
  },
});
