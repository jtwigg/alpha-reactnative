export function getConvexCloudUrl(): string {
  return process.env.EXPO_PUBLIC_CONVEX_URL ?? 'https://placeholder.convex.cloud';
}

export function getConvexSiteUrl(): string {
  return getConvexCloudUrl().replace(/\.convex\.cloud$/, '.convex.site');
}

export function isClerkConfigured(): boolean {
  return Boolean(process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_'));
}

type ClerkGetToken = (options?: {
  template?: string;
  skipCache?: boolean;
}) => Promise<string | null>;

/**
 * Clerk's current Convex integration maps `aud: "convex"` onto the default
 * session token (Dashboard → Sessions → Claims). There is no JWT template
 * named `convex`. ConvexProviderWithClerk does the same check internally.
 */
export function hasConvexAudience(sessionClaims: unknown): boolean {
  if (!sessionClaims || typeof sessionClaims !== 'object') return false;
  const aud = (sessionClaims as { aud?: unknown }).aud;
  if (aud === 'convex') return true;
  return Array.isArray(aud) && aud.includes('convex');
}

export async function getConvexAccessToken(
  getToken: ClerkGetToken,
  sessionClaims?: unknown,
): Promise<string | null> {
  if (hasConvexAudience(sessionClaims)) {
    return getToken();
  }
  // Older Clerk apps used a JWT template named `convex`. Keep that path if
  // the session token does not already carry the Convex audience.
  return getToken({ template: 'convex' });
}

export function getClerkErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (!error) return fallback;

  if (typeof error === 'object') {
    const record = error as {
      message?: unknown;
      errors?: { message?: string; longMessage?: string }[];
      fields?: Record<string, { message?: string } | undefined>;
    };

    if (typeof record.message === 'string' && record.message.trim()) {
      return record.message;
    }

    const fieldError = record.fields
      ? Object.values(record.fields).find((value) => value?.message)?.message
      : undefined;
    if (fieldError) return fieldError;

    const first = record.errors?.[0];
    if (first?.longMessage) return first.longMessage;
    if (first?.message) return first.message;
  }

  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
