import { ClerkProvider, useAuth as useClerkAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { ConvexProviderWithAuth, ConvexReactClient } from 'convex/react';
import { ConvexProviderWithClerk } from 'convex/react-clerk';
import { type ReactNode } from 'react';

import { getConvexCloudUrl, isClerkConfigured } from '@/lib/convex';

const convex = new ConvexReactClient(getConvexCloudUrl());
const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';

function useAuthForConvex() {
  const auth = useClerkAuth();
  return {
    isLoaded: auth.isLoaded,
    isSignedIn: auth.isSignedIn,
    getToken: (options: { template?: 'convex'; skipCache?: boolean }) =>
      auth.getToken({ template: options.template, skipCache: options.skipCache }),
    orgId: auth.orgId,
    orgRole: auth.orgRole,
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
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
