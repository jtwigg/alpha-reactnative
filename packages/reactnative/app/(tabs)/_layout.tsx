import { useAuth } from '@clerk/expo';
import { Redirect, Tabs } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { AccessDenied } from '@/components/access-denied';
import { AuthStuck, useConvexAuthStuck } from '@/components/auth/auth-stuck';
import { HapticTab } from '@/components/haptic-tab';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useStoreUser } from '@/hooks/use-store-user';
import { isClerkConfigured } from '@/lib/convex';
import { isFinanceDemoFlag, useFinanceDemo } from '@/lib/finance-demo';

export default function TabLayout() {
  if (isClerkConfigured()) {
    return <ClerkProtectedTabs />;
  }
  return <AppTabs />;
}

function ClerkProtectedTabs() {
  const { isLoading, isAuthenticated, isDenied } = useStoreUser();
  const { isSignedIn: clerkSignedIn } = useAuth();
  const { stuck, diagnostic } = useConvexAuthStuck();
  const demo = useFinanceDemo() || isFinanceDemoFlag();

  if (stuck && diagnostic && !demo) {
    return <AuthStuck reason={diagnostic.reason} details={diagnostic.details} />;
  }

  if (isLoading && !demo) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  if (isDenied && !demo) {
    return <AccessDenied />;
  }

  if (!isAuthenticated && !demo) {
    if (clerkSignedIn) {
      return (
        <ThemedView style={styles.centered}>
          <ActivityIndicator size="large" />
        </ThemedView>
      );
    }
    return <Redirect href="/sign-in" />;
  }

  return <AppTabs />;
}

function AppTabs() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen name="chat" options={{ href: null }} />
      <Tabs.Screen
        name="briefings"
        options={{
          title: 'Briefings',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="envelope.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="finances"
        options={{
          title: 'Finances',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="chart.line.uptrend.xyaxis" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
