import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

// Returns the text of the first seeded hello world message,
// or a default string if none exist yet.
export const getHello = query({
  args: {},
  handler: async (ctx) => {
    const message = await ctx.db.query('messages').order('asc').first();
    return message?.text ?? 'Hello, World!';
  },
});

// Lists all messages ordered by creation time.
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('messages').order('asc').collect();
  },
});

// Inserts a new message.
export const send = mutation({
  args: {
    text: v.string(),
    author: v.string(),
  },
  handler: async (ctx, { text, author }) => {
    await ctx.db.insert('messages', {
      text,
      author,
      createdAt: Date.now(),
    });
  },
});

// Seeds a "Hello, World!" message — run once via the Convex dashboard or CLI.
export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query('messages').first();
    if (!existing) {
      await ctx.db.insert('messages', {
        text: 'Hello, World!',
        author: 'system',
        createdAt: Date.now(),
      });
    }
  },
});
