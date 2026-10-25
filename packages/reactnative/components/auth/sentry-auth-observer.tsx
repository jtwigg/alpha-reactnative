import { useAuth, useUser } from '@clerk/expo';
import { useConvexAuth } from 'convex/react';
import { useEffect, useRef } from 'react';

import { logAuth, Sentry } from '@/lib/sentry';

/** Clerk user id only (no email). Tracks Clerk + Convex auth transitions for SSO debugging. */
export function SentryAuthObserver() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { user } = useUser();
  const { isLoading: convexLoading, isAuthenticated: convexAuthenticated } = useConvexAuth();
  const clerkId = userId ?? user?.id ?? null;

  const clerkRef = useRef<{ isLoaded: boolean; isSignedIn: boolean | undefined } | null>(null);
  const convexRef = useRef<{ isLoading: boolean; isAuthenticated: boolean } | null>(null);

  useEffect(() => {
    try {
      if (isSignedIn && clerkId) {
        Sentry.setUser({ id: clerkId });
      } else {
        Sentry.setUser(null);
      }
    } catch {
      /* Sentry must not crash launch or auth transitions */
    }
  }, [clerkId, isSignedIn]);

  useEffect(() => {
    const next = { isLoaded, isSignedIn };
    const prev = clerkRef.current;
    if (
      prev &&
      prev.isLoaded === next.isLoaded &&
      prev.isSignedIn === next.isSignedIn
    ) {
      return;
    }
    clerkRef.current = next;
    logAuth('clerk.session', {
      isLoaded,
      isSignedIn: Boolean(isSignedIn),
    });
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    const next = { isLoading: convexLoading, isAuthenticated: convexAuthenticated };
    const prev = convexRef.current;
    if (
      prev &&
      prev.isLoading === next.isLoading &&
      prev.isAuthenticated === next.isAuthenticated
    ) {
      return;
    }
    convexRef.current = next;
    logAuth('convex.auth', {
      isLoading: convexLoading,
      isAuthenticated: convexAuthenticated,
    });
  }, [convexAuthenticated, convexLoading]);

  return null;
}
