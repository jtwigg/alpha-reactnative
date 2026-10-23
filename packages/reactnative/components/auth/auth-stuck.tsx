import { useAuth, useClerk } from '@clerk/expo';
import { Link } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useConvexAuth } from 'convex/react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { describeConvexAuthStuck, hasConvexAudience } from '@/lib/convex';
import { logAuth } from '@/lib/sentry';

const CONVEX_STUCK_MS = 10_000;

/**
 * Clerk signed-in but Convex never leaves isLoading (JWT aud/issuer mismatch).
 * Do not keep an infinite spinner — that looks like a hung Google return.
 */
export function useConvexAuthStuck() {
  const { isLoaded, isSignedIn, sessionClaims } = useAuth();
  const { isLoading: convexLoading, isAuthenticated: convexAuthenticated } = useConvexAuth();
  const [timedOut, setTimedOut] = useState(false);

  const audMismatch = Boolean(
    isLoaded && isSignedIn && sessionClaims && !hasConvexAudience(sessionClaims),
  );
  const waitingOnConvex = Boolean(isLoaded && isSignedIn && convexLoading && !convexAuthenticated);
  const rejectedByConvex = Boolean(isLoaded && isSignedIn && !convexLoading && !convexAuthenticated);

  useEffect(() => {
    if (!waitingOnConvex) {
      setTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setTimedOut(true), CONVEX_STUCK_MS);
    return () => clearTimeout(timer);
  }, [waitingOnConvex]);

  const stuck = rejectedByConvex || (waitingOnConvex && (audMismatch || timedOut));
  const diagnostic = useMemo(
    () => (stuck ? describeConvexAuthStuck(sessionClaims) : null),
    [sessionClaims, stuck],
  );

  useEffect(() => {
    if (!timedOut) return;
    logAuth('convex.auth.timeout', {
      clerkIsSignedIn: Boolean(isSignedIn),
      convexIsLoading: convexLoading,
      convexIsAuthenticated: convexAuthenticated,
      audMismatch,
    });
  }, [audMismatch, convexAuthenticated, convexLoading, isSignedIn, timedOut]);

  useEffect(() => {
    if (!diagnostic) return;
    logAuth('convex.auth.stuck', {
      clerkIsSignedIn: Boolean(isSignedIn),
      convexIsLoading: convexLoading,
      convexIsAuthenticated: convexAuthenticated,
      expectedAud: diagnostic.details.expectedAud,
      hasConvexAud: hasConvexAudience(sessionClaims),
    });
    console.error('[auth] Clerk is signed in but Convex useConvexAuth is still loading', {
      reason: diagnostic.reason,
      ...diagnostic.details,
      clerkIsSignedIn: isSignedIn,
      convexIsLoading: convexLoading,
      convexIsAuthenticated: convexAuthenticated,
    });
  }, [convexAuthenticated, convexLoading, diagnostic, isSignedIn, sessionClaims]);

  return { stuck, diagnostic };
}

export function AuthStuck({
  reason,
  details,
}: {
  reason: string;
  details: {
    aud: unknown;
    iss: unknown;
    expectedAud: string;
    expectedIssuer: string;
  };
}) {
  const { signOut } = useClerk();

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.box}>
          <ThemedText type="title">Signed in, but the app cannot load</ThemedText>
          <ThemedText style={styles.body}>{reason}</ThemedText>
          <ThemedText style={styles.state} selectable>
            {`aud=${JSON.stringify(details.aud)}\niss=${JSON.stringify(details.iss)}\nexpected aud=${details.expectedAud}\nexpected issuer=${details.expectedIssuer}`}
          </ThemedText>
          <Pressable style={styles.button} onPress={() => void signOut()}>
            <Text style={styles.buttonText}>Sign out</Text>
          </Pressable>
          <Link href="/sign-in" replace>
            <ThemedText type="link">Back to sign-in</ThemedText>
          </Link>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  box: { padding: 24, gap: 16, maxWidth: 560 },
  body: { opacity: 0.8, lineHeight: 22 },
  state: { opacity: 0.7, fontSize: 13, lineHeight: 20 },
  button: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#0a7ea4',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonText: { color: '#0a7ea4', fontWeight: '600' },
});
