import { useAction, useQuery } from 'convex/react';
import { useMemo, useState } from 'react';
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
  const messages = (useQuery(api.chat.thread, ready ? {} : 'skip') ?? []) as ThreadMessage[];
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

  return { messages, pending, send, openGrok };
}

export function HomeThread({
  messages,
  pending,
  onOpenGrok,
}: {
  messages: ThreadMessage[];
  pending: boolean;
  onOpenGrok: () => void;
}) {
  const rows = useMemo(() => messages, [messages]);
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

      <FlatList
        data={rows}
        keyExtractor={(item) => item.messageId}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text style={styles.empty}>Ask anything. Replies land here live.</Text>}
        renderItem={({ item }) => (
          <View style={[styles.row, item.role === 'user' ? styles.rowUser : styles.rowAsst]}>
            <View style={[styles.bubble, item.role === 'user' ? styles.bubbleUser : styles.bubbleAsst]}>
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
});
