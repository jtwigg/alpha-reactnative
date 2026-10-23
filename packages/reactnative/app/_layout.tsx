import * as WebBrowser from 'expo-web-browser';
WebBrowser.maybeCompleteAuthSession();

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { initSentry, Sentry } from '@/lib/sentry';
import { AppProviders } from '@/providers/app-providers';

initSentry();

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AppProviders>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="sign-in" options={{ headerShown: false, title: 'Sign in' }} />
          <Stack.Screen name="sign-up" options={{ headerShown: false, title: 'Sign up' }} />
          <Stack.Screen name="sso-callback" options={{ headerShown: false, title: 'Signing in' }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </AppProviders>
  );
}

export default Sentry.wrap(RootLayout);
