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

/** Decodes a JWT payload without verifying it; null when malformed. */
export function decodeJwtClaims(token: string): Record<string, unknown> | null {
  const part = token.split('.')[1];
  if (!part || typeof globalThis.atob !== 'function') return null;
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = decodeURIComponent(
      Array.from(globalThis.atob(padded), (char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''),
    );
    const claims = JSON.parse(json) as unknown;
    return claims && typeof claims === 'object' ? (claims as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * `sessionClaims` can be stale or null right after an in-app sign-in, so when
 * it does not prove aud=convex we fetch the default session token and check
 * its own `aud` before falling back to the legacy `convex` JWT template.
 */
export async function getConvexAccessToken(
  getToken: ClerkGetToken,
  sessionClaims?: unknown,
  options: { skipCache?: boolean } = {},
): Promise<string | null> {
  const skip = options.skipCache ? { skipCache: true } : undefined;
  if (hasConvexAudience(sessionClaims)) {
    return getToken(skip);
  }
  const sessionToken = await getToken(skip);
  if (sessionToken && hasConvexAudience(decodeJwtClaims(sessionToken))) {
    return sessionToken;
  }
  return getToken({ template: 'convex', ...skip });
}

export const CONVEX_TOKEN_TIMEOUT_MS = 15_000;

/** Never let a hung Clerk token request pause the Convex socket forever. */
export async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function describeConvexAuthStuck(
  sessionClaims: unknown,
  state: 'loading' | 'rejected' = 'loading',
): {
  reason: string;
  details: {
    aud: unknown;
    iss: unknown;
    expectedAud: string;
    expectedIssuer: string;
  };
} {
  const claims =
    sessionClaims && typeof sessionClaims === 'object'
      ? (sessionClaims as { aud?: unknown; iss?: unknown })
      : null;
  const aud = claims?.aud ?? null;
  const iss = claims?.iss ?? null;
  const expectedAud = 'convex';
  const expectedIssuer = 'https://awaited-jennet-2760.clerk.accounts.dev';
  const details = { aud, iss, expectedAud, expectedIssuer };

  if (!hasConvexAudience(claims)) {
    return {
      reason: `Clerk session token aud is ${JSON.stringify(aud)}, but Convex auth.config.ts applicationID is "${expectedAud}". ConvexProviderWithClerk will request a JWT template named "convex", which this Clerk app does not have. Enable the Convex native integration so the default session token includes aud=convex.`,
      details,
    };
  }

  if (typeof iss === 'string' && !iss.includes('awaited-jennet-2760')) {
    return {
      reason: `Clerk token issuer (${iss}) does not match Convex auth.config.ts issuer (${expectedIssuer}). Set CLERK_JWT_ISSUER_DOMAIN on the Convex deployment to the Clerk Frontend API URL.`,
      details,
    };
  }

  if (state === 'rejected') {
    return {
      reason:
        'Clerk is signed in and the token has aud=convex, but Convex reported the session as not authenticated (no token was returned, or the server rejected it).',
      details,
    };
  }

  return {
    reason:
      'Clerk is signed in and the token has aud=convex, but Convex useConvexAuth is still isLoading. Convex never confirmed the JWT (issuer/applicationID mismatch, or the websocket never authenticated).',
    details,
  };
}

export function getClerkErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (!error) return fallback;

  if (typeof error === 'object') {
    const record = error as {
      message?: unknown;
      longMessage?: unknown;
      errors?: { message?: string; longMessage?: string }[];
      fields?: Record<string, { message?: string } | undefined>;
    };

    if (typeof record.longMessage === 'string' && record.longMessage.trim()) {
      return record.longMessage;
    }

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
