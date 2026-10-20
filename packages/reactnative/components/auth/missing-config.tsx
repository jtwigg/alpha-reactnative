import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export function MissingConfig() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Almost there</ThemedText>
      <ThemedText>
        Add EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY and EXPO_PUBLIC_CONVEX_URL to
        packages/reactnative/.env.local, then restart Expo. See the root README
        for the full setup checklist.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
});
