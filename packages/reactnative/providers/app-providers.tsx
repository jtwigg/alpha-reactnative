import { ClerkProvider, useAuth as useClerkAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { ConvexProviderWithAuth, ConvexReactClient } from 'convex/react';
import { ConvexProviderWithClerk } from 'convex/react-clerk';
import { type ReactNode } from 'react';

import { SentryAuthObserver } from '@/components/auth/sentry-auth-observer';
import { getConvexCloudUrl, isClerkConfigured } from '@/lib/convex';

const convex = new ConvexReactClient(getConvexCloudUrl());
const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';

// Clerk v4's useAuth() is a broader type than ConvexProviderWithClerk expects.
// Forward getToken options as-is so Convex can request the default session
// token (no `template`) when Clerk's Convex integration set aud: "convex".
function useAuthForConvex() {
  const auth = useClerkAuth();
  return {
    isLoaded: auth.isLoaded,
    isSignedIn: auth.isSignedIn,
    getToken: (options?: { template?: 'convex'; skipCache?: boolean }) =>
      auth.getToken(options),
    orgId: auth.orgId,
    orgRole: auth.orgRole,
    sessionId: auth.sessionId,
    sessionClaims: auth.sessionClaims as Record<string, unknown> | null | undefined,
  };
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
      <ConvexProviderWithClerk client={convex} useAuth={useAuthForConvex}>
        <SentryAuthObserver />
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
