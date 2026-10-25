import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

const snapshotSource = v.union(
  v.literal('manual'),
  v.literal('observed'),
  v.literal('reconstructed'),
  v.literal('interpolated'),
);

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    // Clerk identity: "<issuer>|<subject>"
    tokenIdentifier: v.string(),
  }).index('by_token', ['tokenIdentifier']),

  messages: defineTable({
    userId: v.id('users'),
    text: v.string(),
    createdAt: v.number(),
  }).index('by_user', ['userId']),

  accounts: defineTable({
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
  })
    .index('by_sourceId', ['sourceId'])
    .index('by_class', ['class']),

  balance_snapshots: defineTable({
    accountId: v.string(),
    accountName: v.optional(v.string()),
    class: v.optional(v.string()),
    asOf: v.string(),
    balance: v.number(),
    source: snapshotSource,
    method: v.optional(v.string()),
    updatedAt: v.number(),
    contentHash: v.string(),
  })
    .index('by_account_asOf', ['accountId', 'asOf'])
    .index('by_asOf', ['asOf']),

  transactions: defineTable({
    sourceId: v.string(),
    accountId: v.string(),
    kind: v.union(v.literal('cash'), v.literal('liability'), v.literal('portfolio')),
    date: v.string(),
    amount: v.number(),
    direction: v.string(),
    name: v.string(),
    merchant: v.optional(v.string()),
    category: v.optional(v.string()),
    pending: v.boolean(),
    updatedAt: v.number(),
    contentHash: v.string(),
  })
    .index('by_sourceId', ['sourceId'])
    .index('by_account_date', ['accountId', 'date']),

  holdings: defineTable({
    accountId: v.string(),
    symbol: v.string(),
    qty: v.number(),
    value: v.number(),
    asOf: v.string(),
    updatedAt: v.number(),
    contentHash: v.string(),
  })
    .index('by_account_symbol_asOf', ['accountId', 'symbol', 'asOf'])
    .index('by_account_asOf', ['accountId', 'asOf']),

  /** Append-only record of destructive finance writes (deletes, pending→posted replacements). */
  finance_audit_log: defineTable({
    op: v.string(),
    at: v.number(),
    ids: v.array(v.string()),
    count: v.number(),
    details: v.optional(v.any()),
  }).index('by_op_at', ['op', 'at']),

  /** One row per (date, personal|crankcase). Structured items only — no email bodies. */
  briefings: defineTable({
    date: v.string(),
    account: v.union(v.literal('personal'), v.literal('crankcase')),
    deckName: v.union(v.literal('Personal'), v.literal('Crankcase')),
    headline: v.string(),
    sub: v.string(),
    priorityHeading: v.optional(v.string()),
    glanceHeading: v.optional(v.string()),
    priorities: v.array(
      v.object({
        rank: v.number(),
        deadline: v.string(),
        threadId: v.string(),
        sender: v.string(),
        gist: v.string(),
        todo: v.string(),
        webUrl: v.string(),
        mobileUrl: v.string(),
      }),
    ),
    glance: v.array(
      v.object({
        threadId: v.string(),
        sender: v.string(),
        gist: v.string(),
        webUrl: v.string(),
        mobileUrl: v.string(),
      }),
    ),
    rest: v.object({
      total: v.number(),
      breakdown: v.array(v.object({ label: v.string(), count: v.number() })),
    }),
    updatedAt: v.number(),
  })
    .index('by_date_account', ['date', 'account'])
    .index('by_date', ['date']),

  /** Append-only ingest record. No public query. */
  briefing_audit_log: defineTable({
    op: v.string(),
    at: v.number(),
    date: v.string(),
    count: v.number(),
    details: v.optional(v.any()),
  }).index('by_op_at', ['op', 'at']),

  market_index_bars: defineTable({
    symbol: v.string(),
    asOf: v.string(),
    close: v.number(),
    fetchedAt: v.number(),
  }).index('by_symbol_asOf', ['symbol', 'asOf']),

  market_index_meta: defineTable({
    symbol: v.string(),
    source: v.string(),
    refreshedAt: v.number(),
    lastAsOf: v.optional(v.string()),
  }).index('by_symbol', ['symbol']),

  /** Cash flows that affect TWR (external, Roth, internal). Finance writes only. */
  flows: defineTable({
    flowId: v.string(),
    accountId: v.string(),
    date: v.string(),
    amount: v.number(),
    kind: v.union(
      v.literal('internal_transfer'),
      v.literal('roth_conversion'),
      v.literal('external'),
    ),
    counterpartAccountId: v.optional(v.string()),
    counterpartFlowId: v.optional(v.string()),
    counterpartTxnId: v.optional(v.string()),
    evidence: v.optional(v.string()),
    externalToInvestable: v.boolean(),
    updatedAt: v.number(),
    contentHash: v.string(),
  })
    .index('by_flowId', ['flowId'])
    .index('by_account_date', ['accountId', 'date']),

  /**
   * Materialized net-worth layers. One row per (grain, scopeKind, scopeId, asOf).
   * Day rows are the source of truth; week/month are last-day-in-bucket.
   */
  finance_rollups: defineTable({
    grain: v.union(v.literal('day'), v.literal('week'), v.literal('month')),
    scopeKind: v.union(
      v.literal('account'),
      v.literal('class'),
      v.literal('group'),
      v.literal('total'),
      v.literal('bench'),
    ),
    scopeId: v.string(),
    asOf: v.string(),
    value: v.number(),
    interpolated: v.boolean(),
    byClass: v.optional(v.record(v.string(), v.number())),
    version: v.number(),
  })
    .index('by_grain_scope_asOf', ['grain', 'scopeKind', 'scopeId', 'asOf'])
    .index('by_grain_kind_asOf', ['grain', 'scopeKind', 'asOf']),

  /** Watermark for finance_rollups. One row keyed `global`. */
  finance_rollup_state: defineTable({
    key: v.string(),
    dirtyFrom: v.optional(v.string()),
    rebuiltThrough: v.optional(v.string()),
    version: v.number(),
    status: v.union(v.literal('ready'), v.literal('pending'), v.literal('rebuilding')),
    cursor: v.optional(v.string()),
    updatedAt: v.number(),
  }).index('by_key', ['key']),

  /** Precomputed time-weighted returns. Key is scope+window+asOf. Finance writes only. */
  returns: defineTable({
    scope: v.string(),
    window: v.union(
      v.literal('3M'),
      v.literal('6M'),
      v.literal('YTD'),
      v.literal('1Y'),
      v.literal('3Y'),
      v.literal('SI'),
    ),
    asOf: v.string(),
    startDate: v.string(),
    cumulative: v.number(),
    annualized: v.optional(v.number()),
    reliable: v.boolean(),
    startOnAnchor: v.boolean(),
    flowsFullyKnown: v.boolean(),
    method: v.literal('finance.twr.v1'),
    note: v.optional(v.string()),
    updatedAt: v.number(),
    contentHash: v.string(),
  })
    .index('by_scope_window_asOf', ['scope', 'window', 'asOf'])
    .index('by_scope_asOf', ['scope', 'asOf'])
    .index('by_asOf', ['asOf']),
});
