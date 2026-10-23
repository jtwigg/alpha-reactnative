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
    updatedAt: v.number(),
    contentHash: v.string(),
  }).index('by_sourceId', ['sourceId']),

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
});
