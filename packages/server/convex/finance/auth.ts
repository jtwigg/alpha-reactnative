import { QueryCtx, MutationCtx } from '../_generated/server';
import { evaluateAllowlist, requireAllowedIdentity } from '../allowlist';

/**
 * Finance reads reuse the app-wide default-deny allowlist
 * (`ALLOWED_EMAILS` / `ALLOWED_USER_IDS`). There is no separate
 * FINANCE_ALLOWED_USER_IDS.
 */
export async function getFinanceIdentity(ctx: QueryCtx | MutationCtx) {
  return await ctx.auth.getUserIdentity();
}

export async function isFinanceIdentityAllowed(ctx: QueryCtx | MutationCtx) {
  const identity = await getFinanceIdentity(ctx);
  return evaluateAllowlist(identity).allowed;
}

export async function requireFinanceAccess(ctx: QueryCtx | MutationCtx) {
  return await requireAllowedIdentity(ctx);
}
