import { internalMutation } from '../_generated/server';
import { internal } from '../_generated/api';
import { v } from 'convex/values';
import type { MutationCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import { financeContentHash } from './hash';
import type { SnapshotSource } from './hash';
import { parseIsoDate } from './dates';
import { fillGapsWindow } from './scan';
import {
  addDeleteCounts,
  affectedBuckets,
  emptyDeleteCounts,
  normalizeDeleteIds,
  normalizeDeleteTransactionIds,
} from './delete';
import { isLinkedPending, pendingWindow, pickPendingMatch, type PendingMatch } from './pending';
import { transactionBucketDigests } from './sync';
import {
  assertBatchSize,
  decidePlainWrite,
  decideSnapshotWrite,
  emptyUpsertCounts,
  planFillGaps,
  recordStatus,
  selectBatchWinner,
  snapshotRank,
} from './lib';
import {
  BATCH_CAP,
  DELETE_ROW_BATCH,
  DELETE_WRITE_BUDGET,
  FILL_GAPS_READ_CAP,
  FILL_GAPS_WRITE_CAP,
  PENDING_MATCH_READ_CAP,
  deleteAccountsArgsValidator,
  deleteAccountsResultValidator,
  deleteTransactionsArgsValidator,
  deleteTransactionsResultValidator,
  accountInputValidator,
  fillGapsArgsValidator,
  fillGapsResultValidator,
  holdingInputValidator,
  snapshotInputValidator,
  transactionInputValidator,
  upsertResultValidator,
  upsertTransactionsResultValidator,
} from './validators';

type AccountInput = {
  sourceId: string;
  provider: string;
  connectionId?: string;
  class: string;
  name: string;
  mask?: string;
  type: string;
  subtype?: string;
  currentBalance: number;
  availableBalance?: number;
  currency: string;
  syncedAt: number;
  coverageStart?: string;
};

type SnapshotInput = {
  accountId: string;
  accountName?: string;
  class?: string;
  asOf: string;
  balance: number;
  source: SnapshotSource;
  method?: string;
};

type TransactionInput = {
  sourceId: string;
  accountId: string;
  kind: 'cash' | 'liability' | 'portfolio';
  date: string;
  amount: number;
  direction: string;
  name: string;
  merchant?: string;
  category?: string;
  pending: boolean;
  pendingTransactionId?: string;
};

type HoldingInput = {
  accountId: string;
  symbol: string;
  qty: number;
  value: number;
  asOf: string;
};

function optionalDate(value: string | undefined, field: string): void {
  if (value !== undefined) parseIsoDate(value);
  void field;
}

function omitUndefined<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

function assertAccountConnection(item: AccountInput): void {
  if (item.provider === 'manual') return;
  if (!item.connectionId) {
    throw new Error('connectionId is required when provider is not manual');
  }
}

function accountFields(item: AccountInput): AccountInput {
  assertAccountConnection(item);
  return omitUndefined({
    ...item,
    connectionId: item.provider === 'manual' ? undefined : item.connectionId,
  });
}

function markBatchWinners<T>(
  items: T[],
  keyOf: (item: T) => string,
  rank: (item: T, originalIndex: number) => number,
): boolean[] {
  const groups = new Map<string, number[]>();
  items.forEach((item, index) => {
    const key = keyOf(item);
    const list = groups.get(key) ?? [];
    list.push(index);
    groups.set(key, list);
  });
  const winners = items.map(() => false);
  for (const indexes of groups.values()) {
    const group = indexes.map((index) => items[index]);
    const { winnerIndex } = selectBatchWinner(group, (item, local) =>
      rank(item, indexes[local]),
    );
    winners[indexes[winnerIndex]] = true;
  }
  return winners;
}

/**
 * Admin write path. No HTTP action, no FINANCE_INGEST_SECRET.
 * Finance (the external admin agent) is the only writer.
 *
 *   npx convex run finance/ingest:upsertSnapshots '{"items":[...]}'
 *   npx convex run finance/ingest:upsertAccounts '{"items":[...]}'
 *   npx convex run finance/ingest:upsertTransactions '{"items":[...]}'
 *   npx convex run finance/ingest:upsertHoldings '{"items":[...]}'
 *   npx convex run finance/ingest:fillGaps '{"accountId":"acc_1","from":"2026-07-31","to":"2026-10-12"}'
 *
 * Pusher is master: a sent row overwrites the stored row for the same key.
 * Intra-batch key collisions keep the highest-precedence snapshot
 * (manual > observed > reconstructed > interpolated). Interpolated rows
 * never overwrite non-interpolated ones.
 *
 * After changing non-interpolated snapshots, re-run fillGaps for that
 * account and range so interpolated days recompute (this mutation deletes
 * stale interpolated rows in-range and rewrites the linear series).
 */
export const upsertAccounts = internalMutation({
  args: { items: v.array(accountInputValidator) },
  returns: upsertResultValidator,
  handler: async (ctx, { items }) => {
    assertBatchSize(items.length, BATCH_CAP);
    const counts = emptyUpsertCounts();
    const now = Date.now();
    const lastWins = markBatchWinners(
      items,
      (item) => item.sourceId,
      (_item, index) => index,
    );
    for (let i = 0; i < items.length; i += 1) {
      const raw = items[i];
      const key = raw.sourceId;
      if (!lastWins[i]) {
        recordStatus(counts, key, 'skipped_lower_precedence');
        continue;
      }
      optionalDate(raw.coverageStart, 'coverageStart');
      const item = accountFields(raw);
      const contentHash = await financeContentHash('accounts', item);
      const existing = await ctx.db
        .query('accounts')
        .withIndex('by_sourceId', (q) => q.eq('sourceId', item.sourceId))
        .unique();
      const status = decidePlainWrite(existing?.contentHash ?? null, contentHash);
      recordStatus(counts, key, status);
      if (status === 'unchanged') continue;
      const doc = omitUndefined({ ...item, updatedAt: now, contentHash });
      if (existing) {
        await ctx.db.replace(existing._id, doc);
      } else {
        await ctx.db.insert('accounts', doc);
      }
    }
    return counts;
  },
});

export const upsertSnapshots = internalMutation({
  args: { items: v.array(snapshotInputValidator) },
  returns: upsertResultValidator,
  handler: async (ctx, { items }) => {
    assertBatchSize(items.length, BATCH_CAP);
    const counts = emptyUpsertCounts();
    const now = Date.now();
    const winners = markBatchWinners(
      items,
      (item) => `${item.accountId}|${item.asOf}`,
      (item) => snapshotRank(item.source),
    );
    const seen = new Map<
      string,
      { _id?: Id<'balance_snapshots'>; source: SnapshotSource; contentHash: string }
    >();
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      parseIsoDate(item.asOf);
      const key = `${item.accountId}|${item.asOf}`;
      if (!winners[i]) {
        recordStatus(counts, key, 'skipped_lower_precedence');
        continue;
      }
      const contentHash = await financeContentHash('balance_snapshots', item);
      let existing = seen.get(key);
      if (!existing) {
        const row = await ctx.db
          .query('balance_snapshots')
          .withIndex('by_account_asOf', (q) =>
            q.eq('accountId', item.accountId).eq('asOf', item.asOf),
          )
          .unique();
        if (row) {
          existing = {
            _id: row._id,
            source: row.source,
            contentHash: row.contentHash,
          };
        }
      }
      const status = decideSnapshotWrite(existing ?? null, {
        source: item.source,
        contentHash,
      });
      recordStatus(counts, key, status);
      if (status === 'unchanged' || status === 'skipped_lower_precedence') {
        if (existing) seen.set(key, existing);
        continue;
      }
      const doc = omitUndefined({ ...item, updatedAt: now, contentHash });
      if (existing?._id) {
        await ctx.db.replace(existing._id, doc);
        seen.set(key, { _id: existing._id, source: item.source, contentHash });
      } else {
        const id = await ctx.db.insert('balance_snapshots', doc);
        seen.set(key, { _id: id, source: item.source, contentHash });
      }
    }
    return counts;
  },
});

type PendingReplacement = { postedId: string; pendingId: string; accountId: string; match: PendingMatch };

async function writeAudit(
  ctx: MutationCtx,
  entry: { op: string; ids: string[]; count: number; details?: unknown },
): Promise<void> {
  await ctx.db.insert('finance_audit_log', omitUndefined({ ...entry, at: Date.now() }));
}

async function findPendingReplacement(
  ctx: MutationCtx,
  posted: TransactionInput,
  excluded: ReadonlySet<string>,
  allowFuzzy: boolean,
): Promise<{ row: Doc<'transactions'>; match: PendingMatch } | null> {
  const linkedId = posted.pendingTransactionId?.trim();
  if (linkedId && linkedId !== posted.sourceId && !excluded.has(linkedId)) {
    const linked = await ctx.db
      .query('transactions')
      .withIndex('by_sourceId', (q) => q.eq('sourceId', linkedId))
      .unique();
    if (linked && isLinkedPending(posted, linked)) return { row: linked, match: 'pending_transaction_id' };
  }
  if (!allowFuzzy) return null;
  const window = pendingWindow(posted.date);
  const candidates = await ctx.db
    .query('transactions')
    .withIndex('by_account_date', (q) =>
      q.eq('accountId', posted.accountId).gte('date', window.from).lte('date', window.to),
    )
    .take(PENDING_MATCH_READ_CAP);
  const row = pickPendingMatch(posted, candidates, excluded);
  return row ? { row, match: 'fuzzy' } : null;
}

/**
 * Posted rows replace the pending row they settle: first by the provider's
 * `pendingTransactionId` (same account, still pending), else by a single
 * fuzzy match (same account, amount, normalized payee, ±5 days, closest).
 * The fuzzy path only runs when the posted row is new, so re-sending an
 * unchanged posted row never removes a later, unrelated pending charge.
 * Pending rows that are themselves in the batch are never replaced.
 */
export const upsertTransactions = internalMutation({
  args: { items: v.array(transactionInputValidator) },
  returns: upsertTransactionsResultValidator,
  handler: async (ctx, { items }) => {
    assertBatchSize(items.length, BATCH_CAP);
    const counts = emptyUpsertCounts();
    const now = Date.now();
    const lastWins = markBatchWinners(
      items,
      (item) => item.sourceId,
      (_item, index) => index,
    );
    const batchIds = new Set(items.map((item) => item.sourceId));
    const claimed = new Set<string>(batchIds);
    const replacements: PendingReplacement[] = [];
    for (let i = 0; i < items.length; i += 1) {
      const { pendingTransactionId, ...item } = items[i];
      parseIsoDate(item.date);
      const key = item.sourceId;
      if (!lastWins[i]) {
        recordStatus(counts, key, 'skipped_lower_precedence');
        continue;
      }
      const contentHash = await financeContentHash('transactions', item);
      const existing = await ctx.db
        .query('transactions')
        .withIndex('by_sourceId', (q) => q.eq('sourceId', item.sourceId))
        .unique();
      const status = decidePlainWrite(existing?.contentHash ?? null, contentHash);
      recordStatus(counts, key, status);
      if (status !== 'unchanged') {
        const doc = omitUndefined({ ...item, updatedAt: now, contentHash });
        if (existing) {
          await ctx.db.replace(existing._id, doc);
        } else {
          await ctx.db.insert('transactions', doc);
        }
      }

      if (item.pending) continue;
      const allowFuzzy = status === 'inserted';
      if (!pendingTransactionId && !allowFuzzy) continue;
      const found = await findPendingReplacement(ctx, { ...item, pendingTransactionId }, claimed, allowFuzzy);
      if (!found) continue;
      claimed.add(found.row.sourceId);
      await ctx.db.delete(found.row._id);
      replacements.push({
        postedId: item.sourceId,
        pendingId: found.row.sourceId,
        accountId: item.accountId,
        match: found.match,
      });
    }

    if (replacements.length > 0) {
      await writeAudit(ctx, {
        op: 'upsert_transactions.replace_pending',
        ids: replacements.map((r) => r.pendingId),
        count: replacements.length,
        details: { replacements },
      });
    }
    const byLink = replacements.filter((r) => r.match === 'pending_transaction_id').length;
    return {
      ...counts,
      replacedPending: replacements.length,
      replacedPendingByLink: byLink,
      replacedPendingByMatch: replacements.length - byLink,
      replacements,
    };
  },
});

/**
 * Delete transactions by Alpha id (Convex `_id`) or by `sourceId` (the
 * upsert key). Unknown ids are reported, not errors. Writes one audit entry
 * and returns the recomputed digest for every touched (account, month).
 */
export const deleteTransactions = internalMutation({
  args: deleteTransactionsArgsValidator,
  returns: deleteTransactionsResultValidator,
  handler: async (ctx, args) => {
    const ids = normalizeDeleteTransactionIds(args.ids);
    const rows = new Map<Id<'transactions'>, Doc<'transactions'>>();
    const notFound: string[] = [];
    for (const id of ids) {
      const alphaId = ctx.db.normalizeId('transactions', id);
      const row =
        (alphaId ? await ctx.db.get(alphaId) : null) ??
        (await ctx.db
          .query('transactions')
          .withIndex('by_sourceId', (q) => q.eq('sourceId', id))
          .unique());
      if (row) rows.set(row._id, row);
      else notFound.push(id);
    }
    const deletedRows = [...rows.values()].map((row) => ({
      id: row._id as string,
      sourceId: row.sourceId,
      accountId: row.accountId,
      date: row.date,
    }));
    for (const id of rows.keys()) await ctx.db.delete(id);

    await writeAudit(ctx, {
      op: 'delete_transactions',
      ids,
      count: deletedRows.length,
      details: { deleted: deletedRows, notFound },
    });

    return {
      requested: ids.length,
      deleted: deletedRows.length,
      deletedRows,
      notFound,
      digest: await transactionBucketDigests(ctx, affectedBuckets(deletedRows)),
    };
  },
});

export const upsertHoldings = internalMutation({
  args: { items: v.array(holdingInputValidator) },
  returns: upsertResultValidator,
  handler: async (ctx, { items }) => {
    assertBatchSize(items.length, BATCH_CAP);
    const counts = emptyUpsertCounts();
    const now = Date.now();
    const lastWins = markBatchWinners(
      items,
      (item) => `${item.accountId}|${item.symbol}|${item.asOf}`,
      (_item, index) => index,
    );
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      parseIsoDate(item.asOf);
      const key = `${item.accountId}|${item.symbol}|${item.asOf}`;
      if (!lastWins[i]) {
        recordStatus(counts, key, 'skipped_lower_precedence');
        continue;
      }
      const contentHash = await financeContentHash('holdings', item);
      const existing = await ctx.db
        .query('holdings')
        .withIndex('by_account_symbol_asOf', (q) =>
          q
            .eq('accountId', item.accountId)
            .eq('symbol', item.symbol)
            .eq('asOf', item.asOf),
        )
        .unique();
      const status = decidePlainWrite(existing?.contentHash ?? null, contentHash);
      recordStatus(counts, key, status);
      if (status === 'unchanged') continue;
      const doc = omitUndefined({ ...item, updatedAt: now, contentHash });
      if (existing) {
        await ctx.db.replace(existing._id, doc);
      } else {
        await ctx.db.insert('holdings', doc);
      }
    }
    return counts;
  },
});

export const fillGaps = internalMutation({
  args: fillGapsArgsValidator,
  returns: fillGapsResultValidator,
  handler: async (ctx, { accountId, from, to }) => {
    parseIsoDate(from);
    parseIsoDate(to);
    if (to < from) {
      throw new Error('fillGaps: `to` must be on or after `from`');
    }

    const { windowTo, continueFrom: windowContinue } = fillGapsWindow(
      from,
      to,
      FILL_GAPS_READ_CAP,
    );
    const anchors = await loadAnchors(ctx, accountId, from, windowTo);
    const planned = planFillGaps({ from, to: windowTo, anchors });
    const plannedByDate = new Map(planned.map((point) => [point.asOf, point]));

    const existingRows = await ctx.db
      .query('balance_snapshots')
      .withIndex('by_account_asOf', (q) =>
        q.eq('accountId', accountId).gte('asOf', from).lte('asOf', windowTo),
      )
      .take(FILL_GAPS_READ_CAP);

    const counts = {
      inserted: 0,
      updated: 0,
      unchanged: 0,
      skippedLowerPrecedence: 0,
      deleted: 0,
      daysConsidered: planned.length,
      continueFrom: null as string | null,
    };

    const now = Date.now();
    let writes = 0;

    for (const row of existingRows) {
      if (row.source !== 'interpolated') continue;
      if (plannedByDate.has(row.asOf)) continue;
      await ctx.db.delete(row._id);
      counts.deleted += 1;
      writes += 1;
    }

    const existingByDate = new Map(
      existingRows
        .filter((row) => plannedByDate.has(row.asOf) || row.source !== 'interpolated')
        .map((row) => [row.asOf, row]),
    );

    for (const point of planned) {
      if (writes >= FILL_GAPS_WRITE_CAP) {
        counts.continueFrom = point.asOf;
        break;
      }
      const item: SnapshotInput = {
        accountId,
        asOf: point.asOf,
        balance: point.balance,
        source: 'interpolated',
        method: 'linear',
      };
      const existing = existingByDate.get(point.asOf);
      const contentHash = await financeContentHash('balance_snapshots', item);
      const status = decideSnapshotWrite(
        existing
          ? { source: existing.source, contentHash: existing.contentHash }
          : null,
        { source: 'interpolated', contentHash },
      );
      if (status === 'skipped_lower_precedence') {
        counts.skippedLowerPrecedence += 1;
        continue;
      }
      if (status === 'unchanged') {
        counts.unchanged += 1;
        continue;
      }
      const doc = omitUndefined({ ...item, updatedAt: now, contentHash });
      if (existing) {
        await ctx.db.replace(existing._id, doc);
        counts.updated += 1;
      } else {
        await ctx.db.insert('balance_snapshots', doc);
        counts.inserted += 1;
      }
      writes += 1;
    }

    if (counts.continueFrom == null) {
      counts.continueFrom = windowContinue;
    }
    return counts;
  },
});

async function nearestNonInterpolated(
  ctx: MutationCtx,
  accountId: string,
  fromExclusive: string,
  direction: 'before' | 'after',
): Promise<{ asOf: string; balance: number } | null> {
  let cursor = fromExclusive;
  for (let page = 0; page < 8; page += 1) {
    const rows = await ctx.db
      .query('balance_snapshots')
      .withIndex('by_account_asOf', (q) =>
        direction === 'before'
          ? q.eq('accountId', accountId).lt('asOf', cursor)
          : q.eq('accountId', accountId).gt('asOf', cursor),
      )
      .order(direction === 'before' ? 'desc' : 'asc')
      .take(150);
    if (rows.length === 0) return null;
    const found = rows.find((row) => row.source !== 'interpolated');
    if (found) return { asOf: found.asOf, balance: found.balance };
    cursor = rows[rows.length - 1].asOf;
  }
  return null;
}

async function loadAnchors(
  ctx: MutationCtx,
  accountId: string,
  from: string,
  to: string,
): Promise<Array<{ asOf: string; balance: number }>> {
  const left = await nearestNonInterpolated(ctx, accountId, from, 'before');
  const right = await nearestNonInterpolated(ctx, accountId, to, 'after');
  const inside = await ctx.db
    .query('balance_snapshots')
    .withIndex('by_account_asOf', (q) =>
      q.eq('accountId', accountId).gte('asOf', from).lte('asOf', to),
    )
    .take(FILL_GAPS_READ_CAP);

  const anchors: Array<{ asOf: string; balance: number }> = [];
  if (left) anchors.push(left);
  for (const row of inside) {
    if (row.source !== 'interpolated') {
      anchors.push({ asOf: row.asOf, balance: row.balance });
    }
  }
  if (right) anchors.push(right);
  return anchors;
}

async function deleteIndexedBatch(
  ctx: MutationCtx,
  table: 'balance_snapshots' | 'transactions' | 'holdings',
  accountId: string,
  remainingWrites: number,
): Promise<number> {
  if (remainingWrites <= 0) return 0;
  const take = Math.min(DELETE_ROW_BATCH, remainingWrites);
  const rows =
    table === 'transactions'
      ? await ctx.db
          .query('transactions')
          .withIndex('by_account_date', (q) => q.eq('accountId', accountId))
          .take(take)
      : table === 'holdings'
        ? await ctx.db
            .query('holdings')
            .withIndex('by_account_asOf', (q) => q.eq('accountId', accountId))
            .take(take)
        : await ctx.db
            .query('balance_snapshots')
            .withIndex('by_account_asOf', (q) => q.eq('accountId', accountId))
            .take(take);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

export const deleteAccounts = internalMutation({
  args: deleteAccountsArgsValidator,
  returns: deleteAccountsResultValidator,
  handler: async (ctx, args) => {
    const ids = normalizeDeleteIds(args.ids);
    const session = emptyDeleteCounts();
    let writes = 0;
    const remainingIds: string[] = [];

    for (let i = 0; i < ids.length; i += 1) {
      const accountId = ids[i];
      if (writes >= DELETE_WRITE_BUDGET) {
        remainingIds.push(...ids.slice(i));
        break;
      }

      session.snapshots += await deleteIndexedBatch(
        ctx,
        'balance_snapshots',
        accountId,
        DELETE_WRITE_BUDGET - writes,
      );
      writes = session.snapshots + session.transactions + session.holdings + session.accounts;
      session.transactions += await deleteIndexedBatch(
        ctx,
        'transactions',
        accountId,
        DELETE_WRITE_BUDGET - writes,
      );
      writes = session.snapshots + session.transactions + session.holdings + session.accounts;
      session.holdings += await deleteIndexedBatch(
        ctx,
        'holdings',
        accountId,
        DELETE_WRITE_BUDGET - writes,
      );
      writes = session.snapshots + session.transactions + session.holdings + session.accounts;

      const leftoverSnaps = await ctx.db
        .query('balance_snapshots')
        .withIndex('by_account_asOf', (q) => q.eq('accountId', accountId))
        .take(1);
      const leftoverTxns = await ctx.db
        .query('transactions')
        .withIndex('by_account_date', (q) => q.eq('accountId', accountId))
        .take(1);
      const leftoverHolds = await ctx.db
        .query('holdings')
        .withIndex('by_account_asOf', (q) => q.eq('accountId', accountId))
        .take(1);
      if (leftoverSnaps.length || leftoverTxns.length || leftoverHolds.length) {
        remainingIds.push(...ids.slice(i));
        break;
      }

      const account = await ctx.db
        .query('accounts')
        .withIndex('by_sourceId', (q) => q.eq('sourceId', accountId))
        .unique();
      if (account) {
        await ctx.db.delete(account._id);
        session.accounts += 1;
        writes += 1;
      }
    }

    const counts = addDeleteCounts(args.counts ?? emptyDeleteCounts(), session);
    const shouldContinue = remainingIds.length > 0;
    if (shouldContinue) {
      await ctx.scheduler.runAfter(0, internal.finance.ingest.deleteAccounts, {
        ids: remainingIds,
        mergedInto: args.mergedInto,
        counts,
      });
    }

    return {
      ...counts,
      mergedInto: args.mergedInto ?? null,
      continue: shouldContinue,
      remainingIds,
    };
  },
});

export type {
  AccountInput,
  SnapshotInput,
  TransactionInput,
  HoldingInput,
};
