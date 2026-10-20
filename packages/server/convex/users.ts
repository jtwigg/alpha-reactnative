import { mutation, query, QueryCtx, MutationCtx } from './_generated/server';
import { Doc } from './_generated/dataModel';

type AuthCtx = QueryCtx | MutationCtx;

export async function getIdentityOrThrow(ctx: AuthCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error('Not authenticated');
  }
  return identity;
}

export async function getCurrentUser(ctx: AuthCtx): Promise<Doc<'users'> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return null;
  }
  return await ctx.db
    .query('users')
    .withIndex('by_token', (q) => q.eq('tokenIdentifier', identity.tokenIdentifier))
    .unique();
}

export async function getCurrentUserOrThrow(ctx: AuthCtx): Promise<Doc<'users'>> {
  const user = await getCurrentUser(ctx);
  if (!user) {
    throw new Error('User not found');
  }
  return user;
}

export const current = query({
  args: {},
  handler: async (ctx) => {
    return await getCurrentUser(ctx);
  },
});

export const greeting = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOrThrow(ctx);
    return `Hello, ${user.name}!`;
  },
});

// Upsert the Clerk identity into the users table. The client calls this once
// Convex reports isAuthenticated so queries can join on users._id.
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await getIdentityOrThrow(ctx);
    const existing = await ctx.db
      .query('users')
      .withIndex('by_token', (q) => q.eq('tokenIdentifier', identity.tokenIdentifier))
      .unique();

    const name = identity.name ?? identity.email ?? identity.nickname ?? 'Anonymous';
    const email = identity.email ?? undefined;
    const imageUrl = identity.pictureUrl ?? undefined;

    if (existing) {
      if (
        existing.name !== name ||
        existing.email !== email ||
        existing.imageUrl !== imageUrl
      ) {
        await ctx.db.patch(existing._id, { name, email, imageUrl });
      }
      return existing._id;
    }

    return await ctx.db.insert('users', {
      name,
      email,
      imageUrl,
      tokenIdentifier: identity.tokenIdentifier,
    });
  },
});
