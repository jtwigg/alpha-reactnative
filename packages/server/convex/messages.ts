import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getCurrentUserOrThrow } from './users';

const MAX_MESSAGES = 50;

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOrThrow(ctx);
    return await ctx.db
      .query('messages')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .order('desc')
      .take(MAX_MESSAGES);
  },
});

export const send = mutation({
  args: {
    text: v.string(),
  },
  handler: async (ctx, { text }) => {
    const user = await getCurrentUserOrThrow(ctx);
    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error('Message text is required');
    }
    if (trimmed.length > 4000) {
      throw new Error('Message is too long');
    }
    return await ctx.db.insert('messages', {
      userId: user._id,
      text: trimmed,
      createdAt: Date.now(),
    });
  },
});
