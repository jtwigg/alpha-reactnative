import { useAuth, useClerk, useUser } from '@clerk/expo';
import { useConvexAuth, useQuery } from 'convex/react';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChatInput } from '@/components/chat/chat-input';
import { HomeBriefing } from '@/components/chat/home-briefing';
import { HomeThread, useHomeChat } from '@/components/chat/home-thread';
import { HomeUpdateBannerHost, VersionLabel } from '@/components/home-update-chrome';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { api } from '@/lib/api';
import { isClerkConfigured } from '@/lib/convex';

export default function HomeScreen() {
  if (!isClerkConfigured()) {
    return (
      <ThemedView style={styles.page}>
        <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
          <HomeUpdateBannerHost />
          <View style={styles.header}>
            <ThemedText type="title">Home</ThemedText>
          </View>
          <VersionLabel />
          <View style={styles.flex} />
        </SafeAreaView>
      </ThemedView>
    );
  }
  return <SignedInHome />;
}

function HomeBody({ ready, onToast }: { ready: boolean; onToast: (message: string) => void }) {
  const { messages, pending, send, openGrok } = useHomeChat(ready, onToast);
  return (
    <View style={styles.flex}>
      <HomeThread messages={messages} pending={pending} onOpenGrok={() => void openGrok()} />
      <HomeBriefing ready={ready} />
      <ChatInput onSend={(text) => void send(text)} isLoading={pending} />
    </View>
  );
}

function SignedInHome() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { isSignedIn } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.current, isAuthenticated ? {} : 'skip');
  const greeting = me ? `Hello, ${me.name}` : 'Home';
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast((current) => (current === message ? null : current)), 3200);
  };

  return (
    <ThemedView style={styles.page}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}>
          <HomeUpdateBannerHost />
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.kicker}>Home</Text>
              <ThemedText type="title" style={styles.hello}>
                {greeting}
              </ThemedText>
              <ThemedText style={styles.muted}>
                {user?.primaryEmailAddress?.emailAddress ?? user?.fullName ?? 'Signed in'}
              </ThemedText>
            </View>
            {isSignedIn ? (
              <Pressable style={styles.signOut} onPress={() => void signOut()} accessibilityRole="button">
                <Text style={styles.signOutText}>Sign out</Text>
              </Pressable>
            ) : null}
          </View>
          <VersionLabel />

          {toast ? <Text style={styles.toast}>{toast}</Text> : null}

          <HomeBody ready={isAuthenticated} onToast={showToast} />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f7f7f4' },
  flex: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerText: { flex: 1, gap: 2 },
  kicker: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, color: '#6b7280', textTransform: 'uppercase' },
  hello: { fontSize: 28, lineHeight: 32 },
  muted: { opacity: 0.65, fontSize: 14 },
  signOut: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d1d5db',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#fff',
  },
  signOutText: { color: '#11181C', fontWeight: '600', fontSize: 13 },
  toast: {
    marginHorizontal: 20,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#11181C',
    color: '#fff',
    overflow: 'hidden',
    textAlign: 'center',
    fontWeight: '600',
  },
});
