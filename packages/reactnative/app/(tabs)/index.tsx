import { useAuth, useClerk } from '@clerk/expo';
import { useConvexAuth } from 'convex/react';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLocalSearchParams } from 'expo-router';

import { ChatInput } from '@/components/chat/chat-input';
import { HomeThread, useHomeChat } from '@/components/chat/home-thread';
import { FText } from '@/components/finance/ui';
import { HomeBriefingBanner, HomeFinanceBanner } from '@/components/home-banners';
import { HomeUpdateBannerHost, VersionLabel } from '@/components/home-update-chrome';
import { QueryErrorBoundary } from '@/components/query-error-boundary';
import { isClerkConfigured } from '@/lib/convex';
import { parseAskId } from '@/lib/app-links';
import { useAppPalette } from '@/lib/app-theme';

export default function HomeScreen() {
  const palette = useAppPalette();
  if (!isClerkConfigured()) {
    return (
      <View style={[styles.page, { backgroundColor: palette.page }]}>
        <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
          <HomeUpdateBannerHost />
          <VersionLabel />
          <View style={styles.flex} />
        </SafeAreaView>
      </View>
    );
  }
  return <SignedInHome />;
}

function HomeChatSection({
  ready,
  onToast,
  askId,
  askMalformed,
}: {
  ready: boolean;
  onToast: (message: string) => void;
  askId: string | null;
  askMalformed: boolean;
}) {
  const { messages, pending, send, openGrok, threadReady } = useHomeChat(ready, onToast);
  return (
    <View style={styles.flex}>
      <HomeThread
        messages={messages}
        pending={pending}
        onOpenGrok={() => void openGrok()}
        highlightAskId={askId}
        askMissing={askMalformed}
        ready={threadReady}
      />
      <ChatInput onSend={(text) => void send(text)} isLoading={pending} />
    </View>
  );
}

function HomeBody({ ready, onToast }: { ready: boolean; onToast: (message: string) => void }) {
  const params = useLocalSearchParams<{ ask?: string }>();
  const askParam = typeof params.ask === 'string' ? params.ask : undefined;
  const askId = askParam ? parseAskId(askParam) : null;
  const askMalformed = Boolean(askParam && !askId);
  return (
    <View style={styles.flex}>
      <QueryErrorBoundary compact surface="home-briefing">
        <HomeBriefingBanner ready={ready} />
      </QueryErrorBoundary>
      <QueryErrorBoundary compact surface="home-finance">
        <HomeFinanceBanner ready={ready} />
      </QueryErrorBoundary>
      <QueryErrorBoundary compact surface="home-thread">
        <HomeChatSection ready={ready} onToast={onToast} askId={askId} askMalformed={askMalformed} />
      </QueryErrorBoundary>
    </View>
  );
}

function SignedInHome() {
  const palette = useAppPalette();
  const { signOut } = useClerk();
  const { isSignedIn } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast((current) => (current === message ? null : current)), 3200);
  };

  return (
    <View style={[styles.page, { backgroundColor: palette.page }]}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}>
          <HomeUpdateBannerHost />
          <View style={styles.meta}>
            <VersionLabel />
            {isSignedIn ? (
              <Pressable
                onPress={() => void signOut()}
                accessibilityRole="button"
                accessibilityLabel="Sign out"
                hitSlop={8}
                style={styles.signOut}>
                <FText variant="caption" tone="accent">
                  Sign out
                </FText>
              </Pressable>
            ) : null}
          </View>

          {toast ? (
            <FText variant="callout" style={[styles.toast, { backgroundColor: palette.text, color: palette.card }]}>
              {toast}
            </FText>
          ) : null}

          <HomeBody ready={isAuthenticated} onToast={showToast} />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  flex: { flex: 1 },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 16,
  },
  signOut: { paddingVertical: 4, paddingHorizontal: 4 },
  toast: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    overflow: 'hidden',
    textAlign: 'center',
    fontWeight: '600',
  },
});
