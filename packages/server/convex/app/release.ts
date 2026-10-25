import { internalMutation, query } from '../_generated/server';
import { v } from 'convex/values';

const KEY = 'latest' as const;

const releaseValidator = v.object({
  latestBuildNumber: v.string(),
  runtimeVersion: v.string(),
  testflightUrl: v.union(v.string(), v.null()),
  updatedAt: v.number(),
});

export function normalizeBuildNumber(value: string | number): string {
  const text = String(value).trim();
  if (!text) throw new Error('latestBuildNumber is required');
  return text;
}

export function normalizeRuntimeVersion(value: string | undefined): string {
  const text = value?.trim();
  return text && text.length > 0 ? text : '1.0.0';
}

export function normalizeTestflightUrl(value: string | undefined): string | undefined {
  const text = value?.trim();
  return text && text.length > 0 ? text : undefined;
}

/**
 * Public read of the latest TestFlight binary. No auth — the Home label
 * shows before sign-in, and the payload is only a build number + URL.
 */
export const latest = query({
  args: {},
  returns: v.union(releaseValidator, v.null()),
  handler: async (ctx) => {
    const row = await ctx.db
      .query('app_release')
      .withIndex('by_key', (q) => q.eq('key', KEY))
      .unique();
    if (!row) return null;
    return {
      latestBuildNumber: row.latestBuildNumber,
      runtimeVersion: row.runtimeVersion,
      testflightUrl: row.testflightUrl ?? null,
      updatedAt: row.updatedAt,
    };
  },
});

/**
 * John-only write. Run after each TestFlight submit:
 * `npx convex run app/release:setLatestBuild '{"latestBuildNumber":"4","runtimeVersion":"1.0.0"}'`
 */
export const setLatestBuild = internalMutation({
  args: {
    latestBuildNumber: v.union(v.string(), v.number()),
    runtimeVersion: v.optional(v.string()),
    testflightUrl: v.optional(v.string()),
  },
  returns: releaseValidator,
  handler: async (ctx, args) => {
    const latestBuildNumber = normalizeBuildNumber(args.latestBuildNumber);
    const runtimeVersion = normalizeRuntimeVersion(args.runtimeVersion);
    const testflightUrl = normalizeTestflightUrl(args.testflightUrl);
    const updatedAt = Date.now();
    const existing = await ctx.db
      .query('app_release')
      .withIndex('by_key', (q) => q.eq('key', KEY))
      .unique();
    const stored = { key: KEY, latestBuildNumber, runtimeVersion, testflightUrl, updatedAt };
    if (existing) {
      await ctx.db.patch(existing._id, stored);
    } else {
      await ctx.db.insert('app_release', stored);
    }
    return {
      latestBuildNumber,
      runtimeVersion,
      testflightUrl: testflightUrl ?? null,
      updatedAt,
    };
  },
});
