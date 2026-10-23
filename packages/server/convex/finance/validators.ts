import { v } from 'convex/values';

export const BATCH_CAP = 500;
export const DIGEST_BUCKET_LIMIT_DEFAULT = 100;
export const DIGEST_BUCKET_LIMIT_MAX = 200;
export const EXPORT_PAGE_DEFAULT = 100;
export const EXPORT_PAGE_MAX = 200;
export const FILL_GAPS_WRITE_CAP = 800;

export const snapshotSourceValidator = v.union(
  v.literal('manual'),
  v.literal('observed'),
  v.literal('reconstructed'),
  v.literal('interpolated'),
);

export const transactionKindValidator = v.union(
  v.literal('cash'),
  v.literal('liability'),
  v.literal('portfolio'),
);

export const financeTableValidator = v.union(
  v.literal('accounts'),
  v.literal('balance_snapshots'),
  v.literal('transactions'),
  v.literal('holdings'),
);

export const rowStatusValidator = v.union(
  v.literal('inserted'),
  v.literal('updated'),
  v.literal('unchanged'),
  v.literal('skipped_lower_precedence'),
);

/**
 * Incoming snapshot rows use camelCase. If a feed emits snake_case, map
 * before `npx convex run`:
 *
 *   account_id   → accountId
 *   account_name → accountName
 *   as_of        → asOf
 *   class        → class
 *   balance      → balance
 *   source       → source
 *   method       → method
 */
export const accountInputValidator = v.object({
  sourceId: v.string(),
  connectionId: v.string(),
  class: v.string(),
  name: v.string(),
  mask: v.optional(v.string()),
  type: v.string(),
  subtype: v.optional(v.string()),
  currentBalance: v.number(),
  availableBalance: v.optional(v.number()),
  currency: v.string(),
  syncedAt: v.number(),
  coverageStart: v.optional(v.string()),
});

export const snapshotInputValidator = v.object({
  accountId: v.string(),
  accountName: v.optional(v.string()),
  class: v.optional(v.string()),
  asOf: v.string(),
  balance: v.number(),
  source: snapshotSourceValidator,
  method: v.optional(v.string()),
});

export const transactionInputValidator = v.object({
  sourceId: v.string(),
  accountId: v.string(),
  kind: transactionKindValidator,
  date: v.string(),
  amount: v.number(),
  direction: v.string(),
  name: v.string(),
  merchant: v.optional(v.string()),
  category: v.optional(v.string()),
  pending: v.boolean(),
});

export const holdingInputValidator = v.object({
  accountId: v.string(),
  symbol: v.string(),
  qty: v.number(),
  value: v.number(),
  asOf: v.string(),
});

export const upsertResultValidator = v.object({
  inserted: v.number(),
  updated: v.number(),
  unchanged: v.number(),
  skippedLowerPrecedence: v.number(),
  results: v.array(
    v.object({
      key: v.string(),
      status: rowStatusValidator,
    }),
  ),
});

export const fillGapsArgsValidator = v.object({
  accountId: v.string(),
  from: v.string(),
  to: v.string(),
});

export const fillGapsResultValidator = v.object({
  inserted: v.number(),
  updated: v.number(),
  unchanged: v.number(),
  skippedLowerPrecedence: v.number(),
  deleted: v.number(),
  daysConsidered: v.number(),
  continueFrom: v.union(v.string(), v.null()),
});

export const digestArgsValidator = v.object({
  from: v.optional(v.string()),
  to: v.optional(v.string()),
  table: v.optional(financeTableValidator),
  accountId: v.optional(v.string()),
  cursor: v.optional(v.string()),
  limit: v.optional(v.number()),
});

export const digestBucketValidator = v.object({
  table: financeTableValidator,
  accountId: v.string(),
  month: v.string(),
  count: v.number(),
  sum: v.string(),
  bucketHash: v.string(),
});

export const digestResultValidator = v.object({
  buckets: v.array(digestBucketValidator),
  continueCursor: v.union(v.string(), v.null()),
  isDone: v.boolean(),
});

export const exportBucketArgsValidator = v.object({
  table: financeTableValidator,
  accountId: v.string(),
  month: v.string(),
  cursor: v.optional(v.string()),
  limit: v.optional(v.number()),
});

export const exportedRowValidator = v.object({
  table: financeTableValidator,
  _id: v.string(),
  contentHash: v.string(),
  updatedAt: v.number(),
  source: v.optional(snapshotSourceValidator),
  accountId: v.optional(v.string()),
  sourceId: v.optional(v.string()),
  asOf: v.optional(v.string()),
  date: v.optional(v.string()),
  balance: v.optional(v.number()),
  amount: v.optional(v.number()),
  value: v.optional(v.number()),
  qty: v.optional(v.number()),
  symbol: v.optional(v.string()),
  name: v.optional(v.string()),
  class: v.optional(v.string()),
  method: v.optional(v.string()),
  connectionId: v.optional(v.string()),
  mask: v.optional(v.string()),
  type: v.optional(v.string()),
  subtype: v.optional(v.string()),
  currentBalance: v.optional(v.number()),
  availableBalance: v.optional(v.number()),
  currency: v.optional(v.string()),
  syncedAt: v.optional(v.number()),
  coverageStart: v.optional(v.string()),
  kind: v.optional(transactionKindValidator),
  direction: v.optional(v.string()),
  merchant: v.optional(v.string()),
  category: v.optional(v.string()),
  pending: v.optional(v.boolean()),
  accountName: v.optional(v.string()),
});

export const exportBucketResultValidator = v.object({
  rows: v.array(exportedRowValidator),
  continueCursor: v.union(v.string(), v.null()),
  isDone: v.boolean(),
});
