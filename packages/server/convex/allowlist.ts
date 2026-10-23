export const ALLOWED_EMAILS_ENV = 'ALLOWED_EMAILS';
export const ALLOWED_USER_IDS_ENV = 'ALLOWED_USER_IDS';

export type IdentityLike = {
  subject: string;
  email?: string | null;
};

export type AllowlistDecision = {
  allowed: boolean;
  reason: 'email' | 'user_id' | 'allowlist_unset' | 'not_listed' | 'unauthenticated';
};

export function parseCsvList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function parseAllowedEmails(raw: string | undefined): string[] {
  return parseCsvList(raw).map((email) => email.toLowerCase());
}

export function parseAllowedUserIds(raw: string | undefined): string[] {
  return parseCsvList(raw);
}

/**
 * Default-deny. Email match is case-insensitive. Clerk `subject` is the
 * fallback when the session token has no `email` claim.
 */
export function evaluateAllowlist(
  identity: IdentityLike | null,
  env: Record<string, string | undefined> = process.env as Record<
    string,
    string | undefined
  >,
): AllowlistDecision {
  if (!identity) {
    return { allowed: false, reason: 'unauthenticated' };
  }
  const emails = parseAllowedEmails(env.ALLOWED_EMAILS);
  const userIds = parseAllowedUserIds(env.ALLOWED_USER_IDS);
  if (emails.length === 0 && userIds.length === 0) {
    return { allowed: false, reason: 'allowlist_unset' };
  }
  const email = identity.email?.trim().toLowerCase();
  if (email && emails.includes(email)) {
    return { allowed: true, reason: 'email' };
  }
  if (userIds.includes(identity.subject)) {
    return { allowed: true, reason: 'user_id' };
  }
  return { allowed: false, reason: 'not_listed' };
}

type AuthHolder = {
  auth: {
    getUserIdentity: () => Promise<IdentityLike | null>;
  };
};

export async function getIdentity(ctx: AuthHolder) {
  return await ctx.auth.getUserIdentity();
}

export async function requireAllowedIdentity<T extends IdentityLike>(
  ctx: { auth: { getUserIdentity: () => Promise<T | null> } },
): Promise<T> {
  const identity = await ctx.auth.getUserIdentity();
  const decision = evaluateAllowlist(identity);
  if (!identity) {
    throw new Error('Unauthorized');
  }
  if (!decision.allowed) {
    throw new Error('Forbidden');
  }
  return identity;
}
