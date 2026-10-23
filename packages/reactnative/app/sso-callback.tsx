import * as WebBrowser from 'expo-web-browser';
WebBrowser.maybeCompleteAuthSession();

import { useAuth, useClerk, useSignIn, useSignUp } from '@clerk/expo';
import { type Href, Link, Redirect, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { AuthError } from '@/components/auth/auth-fields';
import { AuthLayout } from '@/components/auth/auth-layout';
import { MissingConfig } from '@/components/auth/missing-config';
import { ThemedText } from '@/components/themed-text';
import { getClerkErrorMessage, isClerkConfigured } from '@/lib/convex';
import {
  SIGN_IN_NEEDS_SIGN_UP_MESSAGE,
  WEB_SSO_COMPLETE_URL,
  describeSsoCallbackState,
  getSignInNeedsSignUpMessage,
} from '@/lib/sso';

const CALLBACK_TIMEOUT_MS = 10_000;

export default function SsoCallbackScreen() {
  if (!isClerkConfigured()) {
    return <MissingConfig />;
  }
  return <SsoCallbackHandler />;
}

function SsoCallbackHandler() {
  const clerk = useClerk();
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const handled = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), CALLBACK_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!isLoaded || !clerk.loaded || handled.current) return;

    handled.current = true;
    void clerk
      .handleRedirectCallback(
        {
          signInFallbackRedirectUrl: WEB_SSO_COMPLETE_URL,
          signUpFallbackRedirectUrl: WEB_SSO_COMPLETE_URL,
          signInUrl: '/sign-in',
          signUpUrl: '/sso-callback',
          continueSignUpUrl: '/sso-callback',
          firstFactorUrl: '/sign-in',
          secondFactorUrl: '/sign-in',
        },
        async (to) => {
          const path = String(to);
          const transfer = getSignInNeedsSignUpMessage(signIn, signUp);
          if (transfer || path.includes('sign-up')) {
            setError(transfer ?? SIGN_IN_NEEDS_SIGN_UP_MESSAGE);
            console.error('[auth] Google SSO redirected to a sign-up/transfer step', {
              to: path,
              signInStatus: signIn?.status,
              signUpStatus: signUp?.status,
            });
            return;
          }
          if (path.startsWith('http') && typeof window !== 'undefined') {
            window.location.replace(path);
            return;
          }
          if (path.startsWith('/')) {
            router.replace(path as Href);
          }
        },
      )
      .catch((err: unknown) => {
        const transfer = getSignInNeedsSignUpMessage(signIn, signUp, err);
        const message = transfer ?? getClerkErrorMessage(err, 'Google sign-in could not finish.');
        console.error('[auth] handleRedirectCallback failed', err);
        setError(message);
      });
  }, [clerk, isLoaded, router, signIn, signUp]);

  useEffect(() => {
    const transfer = getSignInNeedsSignUpMessage(signIn, signUp);
    if (transfer) {
      console.error('[auth] Google SSO needs a sign-up transfer', {
        signInStatus: signIn?.status,
        signUpStatus: signUp?.status,
      });
      setError((current) => current ?? transfer);
    }
  }, [signIn, signUp]);

  if (isSignedIn && !error) {
    return <Redirect href="/" />;
  }

  const state = describeSsoCallbackState({
    isLoaded,
    isSignedIn,
    signIn,
    signUp,
    error,
    timedOut,
  });
  const showFallback = Boolean(error) || timedOut;

  if (showFallback) {
    const fallback =
      error ??
      `Google sign-in did not finish. Clerk never created a session.\n\n${state}`;
    return (
      <AuthLayout
        title="Could not finish sign-in"
        subtitle="Google returned to the app, but Clerk did not complete the session."
      >
        <AuthError message={fallback} />
        <ThemedText style={styles.state} selectable>
          {state}
        </ThemedText>
        <Link href="/sign-in" replace style={styles.link}>
          <ThemedText type="link">Back to sign-in</ThemedText>
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Finishing sign-in"
      subtitle="One moment while we complete Google sign-in."
    >
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', paddingVertical: 16 },
  state: { opacity: 0.7, fontSize: 13, lineHeight: 20 },
  link: { alignSelf: 'flex-start', paddingVertical: 8 },
});
