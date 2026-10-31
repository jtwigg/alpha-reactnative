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

  /** Legacy one-exchange Home ask. New writes go to chat_messages. */
  chat_asks: defineTable({
    userId: v.id('users'),
    messageId: v.string(),
    threadId: v.string(),
    text: v.string(),
    reply: v.optional(v.string()),
    status: v.union(v.literal('pending'), v.literal('replied'), v.literal('error')),
    createdAt: v.number(),
    repliedAt: v.optional(v.number()),
  })
    .index('by_user', ['userId'])
    .index('by_messageId', ['messageId'])
    .index('by_threadId', ['threadId']),

  /** Home Assistant thread. John-only via the app allowlist; one thread per user. */
  chat_messages: defineTable({
    userId: v.id('users'),
    messageId: v.string(),
    threadId: v.string(),
    role: v.union(v.literal('user'), v.literal('assistant')),
    text: v.string(),
    status: v.union(v.literal('pending'), v.literal('complete'), v.literal('error')),
    createdAt: v.number(),
    parentMessageId: v.optional(v.string()),
  })
    .index('by_user_thread', ['userId', 'threadId'])
    .index('by_messageId', ['messageId'])
    .index('by_threadId', ['threadId'])
    .index('by_parent', ['parentMessageId']),

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
        receivedAt: v.optional(v.number()),
      }),
    ),
    glance: v.array(
      v.object({
        threadId: v.string(),
        sender: v.string(),
        gist: v.string(),
        webUrl: v.string(),
        mobileUrl: v.string(),
        receivedAt: v.optional(v.number()),
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

  /**
   * Daily TWR path Finance writes: portfolio value, net invested, and a
   * flow-adjusted S&P 500 dollar path. Key is scope+date.
   */
  series: defineTable({
    scope: v.string(),
    date: v.string(),
    value: v.number(),
    netInvested: v.number(),
    sp500Equiv: v.number(),
    valueInterpolated: v.boolean(),
    estimated: v.boolean(),
    method: v.optional(v.string()),
    updatedAt: v.number(),
    contentHash: v.string(),
  })
    .index('by_scope_date', ['scope', 'date'])
    .index('by_date', ['date']),

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
    .index('by_account_date', ['accountId', 'date'])
    .index('by_date', ['date']),

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
      v.literal('series'),
    ),
    scopeId: v.string(),
    asOf: v.string(),
    value: v.number(),
    interpolated: v.boolean(),
    byClass: v.optional(v.record(v.string(), v.number())),
    netInvested: v.optional(v.number()),
    sp500Equiv: v.optional(v.number()),
    estimated: v.optional(v.boolean()),
    version: v.number(),
  })
    .index('by_grain_scope_asOf', ['grain', 'scopeKind', 'scopeId', 'asOf'])
    .index('by_grain_kind_asOf', ['grain', 'scopeKind', 'asOf']),

  /** Watermark for finance_rollups. One row keyed `global`. Rebuild job only. */
  finance_rollup_state: defineTable({
    key: v.string(),
    dirtyFrom: v.optional(v.string()),
    rebuiltThrough: v.optional(v.string()),
    version: v.number(),
    status: v.union(v.literal('ready'), v.literal('pending'), v.literal('rebuilding'), v.literal('error')),
    cursor: v.optional(v.string()),
    updatedAt: v.number(),
  }).index('by_key', ['key']),

  /**
   * Insert-only dirty queue for rollups. Ingest never reads or patches this
   * (or finance_rollup_state); rebuildStep drains it.
   */
  finance_rollup_dirty: defineTable({
    scopeKey: v.string(),
    from: v.string(),
    createdAt: v.number(),
  }).index('by_scopeKey', ['scopeKey']),

  /**
   * Ready-to-serve chart pages. One compact doc per (kind, scopeId, range).
   * Reads are a single indexed get. Rebuild / serveJobs writes these.
   */
  finance_serve: defineTable({
    kind: v.union(
      v.literal('page'),
      v.literal('account'),
      v.literal('sparklines'),
      v.literal('stack'),
      v.literal('series'),
    ),
    scopeId: v.string(),
    range: v.string(),
    version: v.number(),
    asOf: v.string(),
    grain: v.union(v.literal('day'), v.literal('week'), v.literal('month')),
    payload: v.string(),
    updatedAt: v.number(),
  }).index('by_kind_scope_range', ['kind', 'scopeId', 'range']),

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

  /** First `upsert_series` batch of a replaceScope rewrite, keyed by replaceBatchId. */
  series_replace_batches: defineTable({
    batchId: v.string(),
    scopes: v.array(v.string()),
    createdAt: v.number(),
  }).index('by_batchId', ['batchId']),

  /**
   * Singleton native-release pointer John sets after each TestFlight submit.
   * The app compares `latestBuildNumber` to expo-application `nativeBuildVersion`.
   */
  /** One row per linked institution. `encryptedAccessToken` is AES-GCM; never returned to clients. */
  plaid_items: defineTable({
    plaidItemId: v.string(),
    institutionId: v.optional(v.string()),
    institutionName: v.optional(v.string()),
    encryptedAccessToken: v.string(),
    cursor: v.optional(v.string()),
    status: v.union(
      v.literal('active'),
      v.literal('needs_relink'),
      v.literal('paused'),
    ),
    /** False until the cutover; shadow mode records diff counts and writes no finance rows. */
    live: v.boolean(),
    consecutiveFailures: v.number(),
    lastError: v.optional(v.string()),
    lastSyncedAt: v.optional(v.number()),
    /** Display-only account list (no balances), refreshed at link and on every sync, shadow or live. */
    accounts: v.optional(
      v.array(
        v.object({
          accountId: v.string(),
          name: v.string(),
          mask: v.optional(v.string()),
          type: v.string(),
          subtype: v.optional(v.string()),
        }),
      ),
    ),
    createdAt: v.number(),
  })
    .index('by_plaidItemId', ['plaidItemId'])
    .index('by_institutionId', ['institutionId']),

  /** Plaid account id → Alpha canonical account sourceId. */
  plaid_account_map: defineTable({
    plaidAccountId: v.string(),
    plaidItemId: v.string(),
    sourceId: v.string(),
    type: v.string(),
  })
    .index('by_plaidAccountId', ['plaidAccountId'])
    .index('by_plaidItemId', ['plaidItemId']),

  plaid_sync_runs: defineTable({
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    trigger: v.union(v.literal('cron'), v.literal('manual')),
    status: v.union(v.literal('running'), v.literal('ok'), v.literal('aborted'), v.literal('failed')),
    abortReason: v.optional(v.string()),
    plaidCalls: v.number(),
    mutations: v.number(),
    itemsSynced: v.number(),
    report: v.optional(v.any()),
  }).index('by_startedAt', ['startedAt']),

  /** Deletions are proposals only; nothing is removed without explicit approval. */
  finance_proposed_deletions: defineTable({
    transactionSourceId: v.string(),
    reason: v.union(v.literal('plaid_removed'), v.literal('stale_pending')),
    proposedAt: v.number(),
    status: v.union(v.literal('open'), v.literal('closed')),
  })
    .index('by_status', ['status'])
    .index('by_transactionSourceId', ['transactionSourceId']),

  app_release: defineTable({
    key: v.literal('latest'),
    latestBuildNumber: v.string(),
    runtimeVersion: v.string(),
    testflightUrl: v.optional(v.string()),
    updatedAt: v.number(),
  }).index('by_key', ['key']),
});
