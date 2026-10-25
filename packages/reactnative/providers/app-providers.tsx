import { ClerkProvider, useAuth as useClerkAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { ConvexProviderWithAuth, ConvexReactClient } from 'convex/react';
import { useCallback, useMemo, useRef, type ReactNode } from 'react';

import { SentryAuthObserver } from '@/components/auth/sentry-auth-observer';
import {
  CONVEX_TOKEN_TIMEOUT_MS,
  getConvexAccessToken,
  getConvexCloudUrl,
  isClerkConfigured,
  withTimeout,
} from '@/lib/convex';

function createConvexClient(): ConvexReactClient {
  try {
    return new ConvexReactClient(getConvexCloudUrl());
  } catch {
    return new ConvexReactClient('https://placeholder.convex.cloud');
  }
}

const convex = createConvexClient();
const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';

/**
 * Replaces ConvexProviderWithClerk, whose fetchAccessToken is memoized on
 * orgId/orgRole only and so keeps the `sessionClaims` from before an in-app
 * sign-in (null). That stale value sends it down the `convex` JWT template
 * path, which this Clerk app does not have, so Convex never authenticates.
 * Here the latest Clerk state is read through a ref at call time and the
 * callback is rebuilt whenever the session changes.
 */
function useConvexAuthFromClerk() {
  const { isLoaded, isSignedIn, getToken, sessionClaims, sessionId, orgId, orgRole } = useClerkAuth();
  const latest = useRef({ getToken, sessionClaims });
  latest.current = { getToken, sessionClaims };

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      try {
        const { getToken: currentGetToken, sessionClaims: currentClaims } = latest.current;
        return await withTimeout(
          getConvexAccessToken(
            (options) => currentGetToken(options as Parameters<typeof currentGetToken>[0]),
            currentClaims,
            { skipCache: forceRefreshToken },
          ),
          CONVEX_TOKEN_TIMEOUT_MS,
          null,
        );
      } catch {
        return null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId, orgId, orgRole],
  );

  return useMemo(
    () => ({
      isLoading: !isLoaded,
      isAuthenticated: isSignedIn ?? false,
      fetchAccessToken,
    }),
    [isLoaded, isSignedIn, fetchAccessToken],
  );
}

function useUnauthenticatedConvexAuth() {
  return {
    isLoading: false,
    isAuthenticated: false,
    fetchAccessToken: async () => null,
  };
}

export function AppProviders({ children }: { children: ReactNode }) {
  if (!isClerkConfigured()) {
    return (
      <ConvexProviderWithAuth client={convex} useAuth={useUnauthenticatedConvexAuth}>
        {children}
      </ConvexProviderWithAuth>
    );
  }

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ConvexProviderWithAuth client={convex} useAuth={useConvexAuthFromClerk}>
        <SentryAuthObserver />
        {children}
      </ConvexProviderWithAuth>
    </ClerkProvider>
  );
}
