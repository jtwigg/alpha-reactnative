import { query } from './_generated/server';
import { v } from 'convex/values';
import { evaluateAllowlist, getIdentity } from './allowlist';

/**
 * Auth-only status for the UI gate. Does not throw when the signed-in user
 * is off the allowlist (so they can see Access not granted). Every other
 * public query/mutation/action uses `requireAllowedIdentity`.
 */
export const status = query({
  args: {},
  returns: v.object({
    authenticated: v.boolean(),
    allowed: v.boolean(),
    reason: v.string(),
  }),
  handler: async (ctx) => {
    const identity = await getIdentity(ctx);
    const decision = evaluateAllowlist(identity);
    return {
      authenticated: Boolean(identity),
      allowed: decision.allowed,
      reason: decision.reason,
    };
  },
});
