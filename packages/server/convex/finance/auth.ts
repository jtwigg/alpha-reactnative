import { QueryCtx, MutationCtx } from '../_generated/server';

export const FINANCE_ALLOWED_USER_IDS_ENV = 'FINANCE_ALLOWED_USER_IDS';

export function parseAllowedUserIds(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function isFinanceSubjectAllowed(
  subject: string,
  raw: string | undefined = process.env.FINANCE_ALLOWED_USER_IDS,
): boolean {
  return parseAllowedUserIds(raw).includes(subject);
}

export async function getFinanceIdentity(ctx: QueryCtx | MutationCtx) {
  return await ctx.auth.getUserIdentity();
}

export async function requireFinanceAccess(ctx: QueryCtx | MutationCtx) {
  const identity = await getFinanceIdentity(ctx);
  if (!identity) {
    throw new Error('Unauthorized');
  }
  if (!isFinanceSubjectAllowed(identity.subject)) {
    throw new Error('Forbidden');
  }
  return identity;
}
