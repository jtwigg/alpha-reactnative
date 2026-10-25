import { v } from 'convex/values';

export const BATCH_CAP = 500;
export const DIGEST_BUCKET_LIMIT_DEFAULT = 100;
export const DIGEST_BUCKET_LIMIT_MAX = 200;
export const EXPORT_PAGE_DEFAULT = 100;
export const EXPORT_PAGE_MAX = 200;
export const FILL_GAPS_WRITE_CAP = 800;
/** Inclusive days loaded per fillGaps call so `.collect()` stays under Convex reads. */
export const FILL_GAPS_READ_CAP = 800;
/** Documents a digest/export query may read before returning a cursor. */
export const CONVEX_QUERY_READ_BUDGET = 3200;
export const ROLLUP_WRITE_BUDGET = 700;
export const ROLLUP_DELETE_BATCH = 400;
export const DELETE_ACCOUNT_IDS_MAX = 50;
export const DELETE_ROW_BATCH = 200;
export const DELETE_WRITE_BUDGET = 800;
export const DELETE_TRANSACTION_IDS_MAX = 500;
export const DELETE_FLOW_IDS_MAX = 500;
export const PENDING_MATCH_READ_CAP = 500;

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
  v.literal('flows'),
  v.literal('returns'),
);

export const flowKindValidator = v.union(
  v.literal('internal_transfer'),
  v.literal('roth_conversion'),
  v.literal('external'),
);

export const twrWindowValidator = v.union(
  v.literal('3M'),
  v.literal('6M'),
  v.literal('YTD'),
  v.literal('1Y'),
  v.literal('3Y'),
  v.literal('SI'),
);

export const twrMethodValidator = v.literal('finance.twr.v1');

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
export const rangeKeyValidator = v.union(
  v.literal('1M'),
  v.literal('3M'),
  v.literal('YTD'),
  v.literal('1Y'),
  v.literal('5Y'),
  v.literal('All'),
);

export const accountInputValidator = v.object({
  sourceId: v.string(),
  provider: v.string(),
  connectionId: v.optional(v.string()),
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
  /** Provider's id for the pending row this posted row replaces. Not stored or hashed. */
  pendingTransactionId: v.optional(v.string()),
});

export const holdingInputValidator = v.object({
  accountId: v.string(),
  symbol: v.string(),
  qty: v.number(),
  value: v.number(),
  asOf: v.string(),
});

export const flowInputValidator = v.object({
  flowId: v.string(),
  accountId: v.string(),
  date: v.string(),
  amount: v.number(),
  kind: flowKindValidator,
  counterpartAccountId: v.optional(v.string()),
  counterpartFlowId: v.optional(v.string()),
  counterpartTxnId: v.optional(v.string()),
  evidence: v.optional(v.string()),
  externalToInvestable: v.boolean(),
});

export const returnInputValidator = v.object({
  scope: v.string(),
  window: twrWindowValidator,
  asOf: v.string(),
  startDate: v.string(),
  cumulative: v.number(),
  annualized: v.optional(v.union(v.number(), v.null())),
  reliable: v.boolean(),
  startOnAnchor: v.boolean(),
  flowsFullyKnown: v.boolean(),
  method: twrMethodValidator,
  note: v.optional(v.string()),
});

export const deleteFlowsArgsValidator = v.object({
  ids: v.array(v.string()),
});

export const deleteFlowsResultValidator = v.object({
  requested: v.number(),
  deleted: v.number(),
  deletedRows: v.array(
    v.object({
      id: v.string(),
      flowId: v.string(),
      accountId: v.string(),
      date: v.string(),
    }),
  ),
  notFound: v.array(v.string()),
});

export const tableChecksumValidator = v.object({
  count: v.number(),
  checksum: v.string(),
});

export const twrRowValidator = v.object({
  scope: v.string(),
  window: twrWindowValidator,
  asOf: v.string(),
  startDate: v.string(),
  cumulative: v.number(),
  annualized: v.union(v.number(), v.null()),
  reliable: v.boolean(),
  startOnAnchor: v.boolean(),
  flowsFullyKnown: v.boolean(),
  method: twrMethodValidator,
  note: v.union(v.string(), v.null()),
});

export const flowRowValidator = v.object({
  flowId: v.string(),
  accountId: v.string(),
  date: v.string(),
  amount: v.number(),
  kind: flowKindValidator,
  counterpartAccountId: v.union(v.string(), v.null()),
  counterpartFlowId: v.union(v.string(), v.null()),
  counterpartTxnId: v.union(v.string(), v.null()),
  evidence: v.union(v.string(), v.null()),
  externalToInvestable: v.boolean(),
  counterpart: v.union(
    v.object({
      type: v.literal('transaction'),
      accountId: v.string(),
      sourceId: v.string(),
      name: v.string(),
      date: v.string(),
      amount: v.number(),
    }),
    v.object({
      type: v.literal('flow'),
      accountId: v.string(),
      flowId: v.string(),
      date: v.string(),
      amount: v.number(),
      kind: flowKindValidator,
    }),
    v.object({
      type: v.literal('account'),
      accountId: v.string(),
      name: v.string(),
    }),
    v.null(),
  ),
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

export const pendingReplacementValidator = v.object({
  postedId: v.string(),
  pendingId: v.string(),
  accountId: v.string(),
  match: v.union(v.literal('pending_transaction_id'), v.literal('fuzzy')),
});

export const upsertTransactionsResultValidator = v.object({
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
  replacedPending: v.number(),
  replacedPendingByLink: v.number(),
  replacedPendingByMatch: v.number(),
  replacements: v.array(pendingReplacementValidator),
});

export const deleteTransactionsArgsValidator = v.object({
  ids: v.array(v.string()),
});

export const deleteTransactionsResultValidator = v.object({
  requested: v.number(),
  deleted: v.number(),
  deletedRows: v.array(
    v.object({
      id: v.string(),
      sourceId: v.string(),
      accountId: v.string(),
      date: v.string(),
    }),
  ),
  notFound: v.array(v.string()),
  digest: v.array(
    v.object({
      table: v.literal('transactions'),
      accountId: v.string(),
      month: v.string(),
      count: v.number(),
      sum: v.string(),
      bucketHash: v.string(),
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

export const deleteCountsValidator = v.object({
  accounts: v.number(),
  snapshots: v.number(),
  transactions: v.number(),
  holdings: v.number(),
});

export const deleteAccountsArgsValidator = v.object({
  ids: v.array(v.string()),
  mergedInto: v.optional(v.string()),
  counts: v.optional(deleteCountsValidator),
});

export const deleteAccountsResultValidator = v.object({
  accounts: v.number(),
  snapshots: v.number(),
  transactions: v.number(),
  holdings: v.number(),
  mergedInto: v.union(v.string(), v.null()),
  continue: v.boolean(),
  remainingIds: v.array(v.string()),
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
  flows: tableChecksumValidator,
  returns: tableChecksumValidator,
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
  provider: v.optional(v.string()),
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

export const snapshotLiteValidator = v.object({
  asOf: v.string(),
  balance: v.number(),
  source: snapshotSourceValidator,
});

export const netWorthAccountValidator = v.object({
  sourceId: v.string(),
  name: v.string(),
  class: v.string(),
  provider: v.string(),
  isManual: v.boolean(),
  currentBalance: v.number(),
  signedBalance: v.number(),
  currency: v.string(),
  syncedAt: v.number(),
  coverageStart: v.optional(v.string()),
  firstAsOf: v.union(v.string(), v.null()),
  latestSnapshot: v.union(snapshotLiteValidator, v.null()),
});

export const netWorthResultValidator = v.object({
  total: v.number(),
  byClass: v.record(v.string(), v.number()),
  accounts: v.array(netWorthAccountValidator),
});

export const pageArgsValidator = v.object({
  range: v.optional(rangeKeyValidator),
  asOf: v.optional(v.string()),
  refreshNonce: v.optional(v.number()),
});

export const chartPointValidator = v.object({
  asOf: v.string(),
  total: v.number(),
  interpolated: v.boolean(),
  byClass: v.record(v.string(), v.number()),
});

export const coverageMarkerValidator = v.object({
  asOf: v.string(),
  label: v.string(),
  class: v.string(),
  kind: v.union(v.literal('account'), v.literal('class')),
});

export const pageAccountValidator = v.object({
  sourceId: v.string(),
  name: v.string(),
  class: v.string(),
  provider: v.string(),
  isManual: v.boolean(),
  currentBalance: v.number(),
  signedBalance: v.number(),
  currency: v.string(),
  syncedAt: v.number(),
  coverageStart: v.optional(v.string()),
  firstAsOf: v.union(v.string(), v.null()),
  latestSnapshot: v.union(snapshotLiteValidator, v.null()),
});

export const rollupGrainValidator = v.union(v.literal('day'), v.literal('week'), v.literal('month'));
export const rollupFreshnessValidator = v.union(v.literal('live'), v.literal('stale'), v.literal('raw'));

export const pageResultValidator = v.object({
  range: rangeKeyValidator,
  asOf: v.string(),
  headline: v.number(),
  change: v.number(),
  changePct: v.union(v.number(), v.null()),
  assets: v.number(),
  liabilities: v.number(),
  byClass: v.record(v.string(), v.number()),
  points: v.array(chartPointValidator),
  coverageMarkers: v.array(coverageMarkerValidator),
  accounts: v.array(pageAccountValidator),
  grain: rollupGrainValidator,
  rollup: rollupFreshnessValidator,
});

export const rebuildStepResultValidator = v.object({
  done: v.boolean(),
  status: v.union(v.literal('ready'), v.literal('pending'), v.literal('rebuilding')),
  wrote: v.number(),
  from: v.union(v.string(), v.null()),
  to: v.union(v.string(), v.null()),
  rebuiltThrough: v.union(v.string(), v.null()),
});

export const rebuildAllResultValidator = v.object({
  scheduled: v.boolean(),
  dirtyFrom: v.union(v.string(), v.null()),
  version: v.number(),
});

export const consistencyMismatchValidator = v.object({
  asOf: v.string(),
  ok: v.boolean(),
});

export const consistencyResultValidator = v.object({
  checked: v.number(),
  matched: v.number(),
  mismatches: v.array(consistencyMismatchValidator),
  rebuiltThrough: v.union(v.string(), v.null()),
  status: v.union(v.literal('ready'), v.literal('pending'), v.literal('rebuilding'), v.literal('missing')),
});

export const snapshotsArgsValidator = v.object({
  accountId: v.optional(v.string()),
  from: v.optional(v.string()),
  to: v.optional(v.string()),
  limit: v.optional(v.number()),
});

export const holdingsArgsValidator = v.object({
  accountId: v.optional(v.string()),
  asOf: v.optional(v.string()),
});

export const accountDocValidator = v.object({
  _id: v.id('accounts'),
  _creationTime: v.number(),
  sourceId: v.string(),
  provider: v.string(),
  connectionId: v.optional(v.string()),
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
  updatedAt: v.number(),
  contentHash: v.string(),
});

export const snapshotDocValidator = v.object({
  _id: v.id('balance_snapshots'),
  _creationTime: v.number(),
  accountId: v.string(),
  accountName: v.optional(v.string()),
  class: v.optional(v.string()),
  asOf: v.string(),
  balance: v.number(),
  source: snapshotSourceValidator,
  method: v.optional(v.string()),
  updatedAt: v.number(),
  contentHash: v.string(),
});

export const holdingDocValidator = v.object({
  _id: v.id('holdings'),
  _creationTime: v.number(),
  accountId: v.string(),
  symbol: v.string(),
  qty: v.number(),
  value: v.number(),
  asOf: v.string(),
  updatedAt: v.number(),
  contentHash: v.string(),
});


