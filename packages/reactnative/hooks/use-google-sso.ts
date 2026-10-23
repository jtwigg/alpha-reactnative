import { useAuth, useClerk, useSignIn } from '@clerk/expo';
import { useSSO } from '@clerk/expo/experimental';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { getClerkErrorMessage } from '@/lib/convex';
import {
  WEB_SSO_COMPLETE_URL,
  WEB_SSO_REDIRECT_URL,
  getSignInNeedsSignUpMessage,
  getSsoRedirectUrl,
} from '@/lib/sso';

function useWarmUpBrowser() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
}

export function useGoogleSso() {
  useWarmUpBrowser();
  const { isLoaded } = useAuth();
  const clerk = useClerk();
  const { signIn } = useSignIn();
  const { startSSOFlow } = useSSO();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const continueWithGoogle = useCallback(async () => {
    if (!isLoaded) return;
    setError(null);
    setLoading(true);
    try {
      if (Platform.OS === 'web') {
        // Full-page redirect. useSSO + openAuthSessionAsync never resumes on a
        // static Vercel SPA after Google returns to /sso-callback.
        if (!clerk.client?.signIn) {
          setError('Clerk sign-in is not ready yet. Try again.');
          return;
        }
        await clerk.client.signIn.authenticateWithRedirect({
          strategy: 'oauth_google',
          redirectUrl: WEB_SSO_REDIRECT_URL,
          redirectUrlComplete: WEB_SSO_COMPLETE_URL,
        });
        return;
      }

      const { createdSessionId, signIn: nativeSignIn, signUp, authSessionResult } =
        await startSSOFlow({
          strategy: 'oauth_google',
          redirectUrl: getSsoRedirectUrl(),
        });

      if (authSessionResult && authSessionResult.type !== 'success') {
        return;
      }

      if (createdSessionId) {
        return;
      }

      const transfer = getSignInNeedsSignUpMessage(nativeSignIn, signUp);
      if (transfer) {
        setError(transfer);
        return;
      }

      if (signUp?.status === 'missing_requirements') {
        const missing = signUp.missingFields?.join(', ') || 'more information';
        setError(`Google sign-in needs ${missing}. Check required fields in the Clerk dashboard.`);
      }
    } catch (err) {
      const transfer = getSignInNeedsSignUpMessage(signIn, null, err);
      setError(transfer ?? getClerkErrorMessage(err, 'Google sign-in failed'));
    } finally {
      setLoading(false);
    }
  }, [clerk, isLoaded, signIn, startSSOFlow]);

  return { continueWithGoogle, loading, error, ready: isLoaded };
}
