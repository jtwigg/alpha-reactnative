import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

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
});
