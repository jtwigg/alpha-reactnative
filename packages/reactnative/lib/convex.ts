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

export function describeConvexAuthStuck(sessionClaims: unknown): {
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
