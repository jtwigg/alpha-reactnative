import { useAction, useQuery } from 'convex/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { api } from '@/lib/api';
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
        <Text style={styles.kicker}>Assistant</Text>
        <Pressable
          onPress={onOpenGrok}
          accessibilityRole="button"
          accessibilityLabel="Open in Grok Bot"
          accessibilityHint={GROK_BOT_AGENT_URL}
          hitSlop={8}>
          <Text style={styles.grok}>Open in Grok Bot</Text>
        </Pressable>
      </View>

      {askMissing || unknownAsk ? (
        <View style={styles.missing} accessibilityRole="alert">
          <Text style={styles.missingText}>Ask not found</Text>
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
        ListEmptyComponent={<Text style={styles.empty}>Ask anything. Replies land here live.</Text>}
        renderItem={({ item }) => (
          <View style={[styles.row, item.role === 'user' ? styles.rowUser : styles.rowAsst]}>
            <View
              style={[
                styles.bubble,
                item.role === 'user' ? styles.bubbleUser : styles.bubbleAsst,
                item.messageId === highlightAskId && styles.bubbleOn,
              ]}
              accessibilityState={{ selected: item.messageId === highlightAskId }}
            >
              <Text style={[styles.body, item.role === 'user' ? styles.bodyUser : styles.bodyAsst]}>{item.text}</Text>
              {item.role === 'user' && item.status === 'error' ? (
                <Text style={styles.error}>Could not reach Assistant.</Text>
              ) : null}
            </View>
          </View>
        )}
        ListFooterComponent={
          pending ? (
            <View style={[styles.row, styles.rowAsst]}>
              <View style={[styles.bubble, styles.bubbleAsst, styles.thinking]}>
                <ActivityIndicator size="small" color="#6b7280" />
                <Text style={styles.thinkingText}>Thinking…</Text>
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
  kicker: { fontSize: 13, fontWeight: '600', letterSpacing: 0.4, color: '#6b7280', textTransform: 'uppercase' },
  grok: { fontSize: 14, fontWeight: '600', color: '#0a7ea4' },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 12, gap: 8, flexGrow: 1, justifyContent: 'flex-end' },
  empty: { fontSize: 15, lineHeight: 22, color: '#6b7280', paddingHorizontal: 8, paddingVertical: 24 },
  row: { maxWidth: '86%', marginVertical: 2 },
  rowUser: { alignSelf: 'flex-end' },
  rowAsst: { alignSelf: 'flex-start' },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleUser: { backgroundColor: '#11181C' },
  bubbleAsst: { backgroundColor: '#ecece8' },
  body: { fontSize: 16, lineHeight: 22 },
  bodyUser: { color: '#fff' },
  bodyAsst: { color: '#11181C' },
  error: { marginTop: 6, fontSize: 13, color: '#fca5a5' },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  thinkingText: { fontSize: 15, color: '#6b7280' },
  bubbleOn: { borderWidth: 2, borderColor: '#c2410c' },
  missing: {
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 10,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fdba74',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  missingText: { color: '#c2410c', fontWeight: '700', fontSize: 14 },
});
