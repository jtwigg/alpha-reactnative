import * as WebBrowser from 'expo-web-browser';
try {
  WebBrowser.maybeCompleteAuthSession();
} catch {
  /* SSO return must not crash launch if the browser bridge is offline */
}

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { QueryErrorBoundary } from '@/components/query-error-boundary';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { initSentry, wrapRoot } from '@/lib/sentry';
import { AppProviders } from '@/providers/app-providers';

initSentry();

export const unstable_settings = {
  anchor: '(tabs)',
};

export function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <QueryErrorBoundary showVersion surface="root">
      <AppProviders>
        <QueryErrorBoundary showVersion surface="app">
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="sign-in" options={{ headerShown: false, title: 'Sign in' }} />
              <Stack.Screen name="sign-up" options={{ headerShown: false, title: 'Sign up' }} />
              <Stack.Screen name="sso-callback" options={{ headerShown: false, title: 'Signing in' }} />
            </Stack>
            <StatusBar style="auto" />
          </ThemeProvider>
        </QueryErrorBoundary>
      </AppProviders>
    </QueryErrorBoundary>
  );
}

export default wrapRoot(RootLayout);
