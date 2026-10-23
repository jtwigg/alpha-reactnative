import { useAuth } from '@clerk/expo';
import { useSSO } from '@clerk/expo/experimental';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { getClerkErrorMessage } from '@/lib/convex';
import { getSsoRedirectUrl } from '@/lib/sso';

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
  const { startSSOFlow } = useSSO();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const continueWithGoogle = useCallback(async () => {
    if (!isLoaded) return;
    setError(null);
    setLoading(true);
    try {
      const { createdSessionId, signUp, authSessionResult } = await startSSOFlow({
        strategy: 'oauth_google',
        redirectUrl: getSsoRedirectUrl(),
      });

      if (authSessionResult && authSessionResult.type !== 'success') {
        return;
      }

      if (createdSessionId) {
        return;
      }

      if (signUp?.status === 'missing_requirements') {
        const missing = signUp.missingFields?.join(', ') || 'more information';
        setError(`Google sign-in needs ${missing}. Check required fields in the Clerk dashboard.`);
      }
    } catch (err) {
      setError(getClerkErrorMessage(err, 'Google sign-in failed'));
    } finally {
      setLoading(false);
    }
  }, [isLoaded, startSSOFlow]);

  return { continueWithGoogle, loading, error, ready: isLoaded };
}
