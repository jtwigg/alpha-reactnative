import { useAction, useQuery } from 'convex/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { api } from '@/lib/api';
import { useAppPalette } from '@/lib/app-theme';
import { GROK_BOT_AGENT_URL, openGrokBot } from '@/lib/grok-bot';

type ThreadMessage = {
  messageId: string;
  role: 'user' | 'assistant';
  text: string;
  status: 'pending' | 'complete' | 'error';
  createdAt: number;
  parentMessageId: string | null;
};

function thinking(messages: ThreadMessage[]): boolean {
  const lastUser = [...messages].reverse().find((row) => row.role === 'user');
  if (!lastUser || lastUser.status !== 'pending') return false;
  return !messages.some((row) => row.role === 'assistant' && row.parentMessageId === lastUser.messageId);
}

export function useHomeChat(ready: boolean, onToast: (message: string) => void) {
  const loaded = useQuery(api.chat.thread, ready ? {} : 'skip') as ThreadMessage[] | undefined;
  const messages = loaded ?? [];
  const threadReady = loaded !== undefined;
  const ask = useAction(api.chat.ask);
  const [sending, setSending] = useState(false);
  const pending = thinking(messages) || sending;

  const send = async (text: string) => {
    setSending(true);
    try {
      const result = await ask({ text });
      if (!result.ok) onToast(result.error === 'not configured' ? 'Assistant is not configured' : 'Could not send');
    } catch {
      onToast('Could not send');
    } finally {
      setSending(false);
    }
  };

  const openGrok = async () => {
    const result = await openGrokBot();
    if (result === 'failed') onToast('Grok Bot is not installed');
  };

  return { messages, pending, send, openGrok, threadReady };
}

export function HomeThread({
  messages,
  pending,
  onOpenGrok,
  highlightAskId,
  askMissing,
  ready,
}: {
  messages: ThreadMessage[];
  pending: boolean;
  onOpenGrok: () => void;
  highlightAskId?: string | null;
  askMissing?: boolean;
  ready?: boolean;
}) {
  const palette = useAppPalette();
  const rows = useMemo(() => messages, [messages]);
  const listRef = useRef<FlatList<ThreadMessage>>(null);
  const highlightIndex = highlightAskId ? rows.findIndex((row) => row.messageId === highlightAskId) : -1;
  const unknownAsk = Boolean(highlightAskId && ready && highlightIndex < 0);
  useEffect(() => {
    if (highlightIndex < 0) return;
    listRef.current?.scrollToIndex({ index: highlightIndex, animated: true, viewPosition: 0.4 });
  }, [highlightIndex]);
  return (
    <View style={styles.wrap}>
      <View style={styles.toolbar}>
        <Text style={[styles.kicker, { color: palette.muted }]}>Assistant</Text>
        <Pressable
          onPress={onOpenGrok}
          accessibilityRole="button"
          accessibilityLabel="Open in Grok Bot"
          accessibilityHint={GROK_BOT_AGENT_URL}
          hitSlop={8}>
          <Text style={[styles.grok, { color: palette.accent }]}>Open in Grok Bot</Text>
        </Pressable>
      </View>

      {askMissing || unknownAsk ? (
        <View
          style={[styles.missing, { backgroundColor: palette.accentSoft, borderColor: palette.accent }]}
          accessibilityRole="alert">
          <Text style={[styles.missingText, { color: palette.accent }]}>Ask not found</Text>
        </View>
      ) : null}

      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(item) => item.messageId}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        onScrollToIndexFailed={() => undefined}
        ListEmptyComponent={<Text style={[styles.empty, { color: palette.muted }]}>Ask anything. Replies land here live.</Text>}
        renderItem={({ item }) => (
          <View style={[styles.row, item.role === 'user' ? styles.rowUser : styles.rowAsst]}>
            <View
              style={[
                styles.bubble,
                item.role === 'user' ? { backgroundColor: palette.text } : { backgroundColor: palette.chip },
                item.messageId === highlightAskId && { borderWidth: 2, borderColor: palette.accent },
              ]}
              accessibilityState={{ selected: item.messageId === highlightAskId }}
            >
              <Text
                style={[
                  styles.body,
                  { color: item.role === 'user' ? palette.card : palette.text },
                ]}>
                {item.text}
              </Text>
              {item.role === 'user' && item.status === 'error' ? (
                <Text style={styles.error}>Could not reach Assistant.</Text>
              ) : null}
            </View>
          </View>
        )}
        ListFooterComponent={
          pending ? (
            <View style={[styles.row, styles.rowAsst]}>
              <View style={[styles.bubble, { backgroundColor: palette.chip }, styles.thinking]}>
                <ActivityIndicator size="small" color={palette.muted} />
                <Text style={[styles.thinkingText, { color: palette.muted }]}>Thinking…</Text>
              </View>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
  },
  kicker: { fontSize: 13, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
  grok: { fontSize: 14, fontWeight: '600' },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 12, gap: 8, flexGrow: 1, justifyContent: 'flex-end' },
  empty: { fontSize: 15, lineHeight: 22, paddingHorizontal: 8, paddingVertical: 24 },
  row: { maxWidth: '86%', marginVertical: 2 },
  rowUser: { alignSelf: 'flex-end' },
  rowAsst: { alignSelf: 'flex-start' },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  body: { fontSize: 16, lineHeight: 22 },
  error: { marginTop: 6, fontSize: 13, color: '#fca5a5' },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  thinkingText: { fontSize: 15 },
  missing: {
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  missingText: { fontWeight: '700', fontSize: 14 },
});
