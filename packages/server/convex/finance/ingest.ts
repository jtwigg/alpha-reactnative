import { internalMutation } from '../_generated/server';
import { v } from 'convex/values';
import type { MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { financeContentHash } from './hash';
import type { SnapshotSource } from './hash';
import { parseIsoDate } from './dates';
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
  FILL_GAPS_WRITE_CAP,
  accountInputValidator,
  fillGapsArgsValidator,
  fillGapsResultValidator,
  holdingInputValidator,
  snapshotInputValidator,
  transactionInputValidator,
  upsertResultValidator,
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

export const upsertTransactions = internalMutation({
  args: { items: v.array(transactionInputValidator) },
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
      const item = items[i];
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
      if (status === 'unchanged') continue;
      const doc = omitUndefined({ ...item, updatedAt: now, contentHash });
      if (existing) {
        await ctx.db.replace(existing._id, doc);
      } else {
        await ctx.db.insert('transactions', doc);
      }
    }
    return counts;
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

    const anchors = await loadAnchors(ctx, accountId, from, to);
    const planned = planFillGaps({ from, to, anchors });
    const plannedByDate = new Map(planned.map((point) => [point.asOf, point]));

    const existingRows = await ctx.db
      .query('balance_snapshots')
      .withIndex('by_account_asOf', (q) =>
        q.eq('accountId', accountId).gte('asOf', from).lte('asOf', to),
      )
      .collect();

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

    return counts;
  },
});

async function loadAnchors(
  ctx: MutationCtx,
  accountId: string,
  from: string,
  to: string,
): Promise<Array<{ asOf: string; balance: number }>> {
  const prior = await ctx.db
    .query('balance_snapshots')
    .withIndex('by_account_asOf', (q) =>
      q.eq('accountId', accountId).lt('asOf', from),
    )
    .order('desc')
    .take(400);
  const left = prior.find((row) => row.source !== 'interpolated');

  const after = await ctx.db
    .query('balance_snapshots')
    .withIndex('by_account_asOf', (q) =>
      q.eq('accountId', accountId).gt('asOf', to),
    )
    .order('asc')
    .take(400);
  const right = after.find((row) => row.source !== 'interpolated');

  const inside = await ctx.db
    .query('balance_snapshots')
    .withIndex('by_account_asOf', (q) =>
      q.eq('accountId', accountId).gte('asOf', from).lte('asOf', to),
    )
    .collect();

  const anchors: Array<{ asOf: string; balance: number }> = [];
  if (left) anchors.push({ asOf: left.asOf, balance: left.balance });
  for (const row of inside) {
    if (row.source !== 'interpolated') {
      anchors.push({ asOf: row.asOf, balance: row.balance });
    }
  }
  if (right) anchors.push({ asOf: right.asOf, balance: right.balance });
  return anchors;
}

export type {
  AccountInput,
  SnapshotInput,
  TransactionInput,
  HoldingInput,
};
