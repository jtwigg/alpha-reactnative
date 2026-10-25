import { useAction, useQuery } from 'convex/react';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ChatInput } from '@/components/chat/chat-input';
import { api } from '@/lib/api';
import { GROK_BOT_AGENT_URL, openGrokBot } from '@/lib/grok-bot';

export function QuickAsk({
  ready,
  onToast,
}: {
  ready: boolean;
  onToast: (message: string) => void;
}) {
  const latest = useQuery(api.chat.latest, ready ? {} : 'skip');
  const ask = useAction(api.chat.ask);
  const [sending, setSending] = useState(false);

  const handleSend = async (text: string) => {
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

  const handleOpenGrok = async () => {
    const result = await openGrokBot();
    if (result === 'failed') {
      onToast('Grok Bot is not installed');
    }
  };

  const pending = latest?.status === 'pending' || sending;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Ask Assistant</Text>
      <Text style={styles.hint}>One question at a time. For a full chat, open Grok Bot.</Text>

      <Pressable
        style={styles.grok}
        onPress={handleOpenGrok}
        accessibilityRole="button"
        accessibilityLabel="Open in Grok Bot"
        accessibilityHint={GROK_BOT_AGENT_URL}
      >
        <Text style={styles.grokText}>Open in Grok Bot</Text>
      </Pressable>

      {latest ? (
        <View style={styles.exchange}>
          <Text style={styles.youLabel}>You</Text>
          <Text style={styles.you}>{latest.text}</Text>
          <Text style={styles.asstLabel}>Assistant</Text>
          {pending && !latest.reply ? (
            <View style={styles.pendingRow}>
              <ActivityIndicator size="small" color="#0a7ea4" />
              <Text style={styles.pending}>Waiting for a reply…</Text>
            </View>
          ) : (
            <Text style={styles.asst}>
              {latest.reply ?? (latest.status === 'error' ? 'Could not reach Assistant.' : '')}
            </Text>
          )}
        </View>
      ) : (
        <Text style={styles.empty}>Ask anything. Only the latest exchange stays here.</Text>
      )}

      <ChatInput onSend={handleSend} isLoading={sending || latest?.status === 'pending'} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d5d5d5',
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  title: { fontSize: 18, fontWeight: '700', paddingHorizontal: 16, paddingTop: 14 },
  hint: { fontSize: 13, color: '#666', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10 },
  grok: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#11181C',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  grokText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  exchange: { paddingHorizontal: 16, paddingBottom: 8, gap: 4 },
  youLabel: { fontSize: 12, fontWeight: '600', color: '#0a7ea4', marginTop: 4 },
  asstLabel: { fontSize: 12, fontWeight: '600', color: '#555', marginTop: 10 },
  you: { fontSize: 16, lineHeight: 22, color: '#111' },
  asst: { fontSize: 16, lineHeight: 22, color: '#111' },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  pending: { fontSize: 15, color: '#666' },
  empty: { fontSize: 14, color: '#888', paddingHorizontal: 16, paddingBottom: 12 },
});
