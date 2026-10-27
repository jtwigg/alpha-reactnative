import { useAuth, useClerk, useUser } from '@clerk/expo';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAppPalette } from '@/lib/app-theme';

export function AccessDenied() {
  const palette = useAppPalette();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { isSignedIn } = useAuth();
  const email =
    user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress ?? null;

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.box}>
          <ThemedText type="title">Access not granted</ThemedText>
          <ThemedText style={styles.body}>
            This app is limited to a private allowlist. You are signed in
            {email ? ` as ${email}` : ''}, but that account cannot load any data.
          </ThemedText>
          {isSignedIn ? (
            <Pressable style={[styles.button, { borderColor: palette.accent }]} onPress={() => signOut()}>
              <Text style={[styles.buttonText, { color: palette.accent }]}>Sign out</Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  box: { padding: 24, gap: 16, maxWidth: 480 },
  body: { opacity: 0.75, lineHeight: 22 },
  button: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonText: { fontWeight: '600' },
});
