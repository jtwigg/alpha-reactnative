import { useAction, useQuery } from 'convex/react';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { BriefingCard } from '@/components/briefing/card';
import { api } from '@/lib/api';
import { formatBriefingDate } from '@/lib/briefing-gesture';

export function HomeBriefing({ ready }: { ready: boolean }) {
  const router = useRouter();
  const allowed = useQuery(api.briefings.queries.isAllowed, ready ? {} : 'skip');
  const dates = useQuery(api.briefings.queries.listDates, allowed ? {} : 'skip');
  const date = dates?.[0]?.date ?? null;
  const day = useQuery(api.briefings.queries.getDay, allowed && date ? { date } : 'skip');
  const send = useAction(api.briefings.feedback.send);
  const [tab, setTab] = useState<'personal' | 'crankcase'>('personal');

  useEffect(() => {
    if (tab === 'personal' && day && !day.personal && day.crankcase) setTab('crankcase');
  }, [day, tab]);

  if (!ready || allowed === false) return null;
  if (allowed === undefined || (dates === undefined && allowed)) {
    return (
      <View style={styles.card}>
        <ActivityIndicator size="small" color="#c2410c" />
      </View>
    );
  }
  if (!date || !day) {
    return (
      <View style={styles.card}>
        <Text style={styles.kicker}>Briefing</Text>
        <Text style={styles.empty}>No briefing yet.</Text>
      </View>
    );
  }

  const section = day[tab];
  const items = section?.priorities.slice(0, 2) ?? [];

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={styles.kicker}>Briefing</Text>
          <Text style={styles.title}>{formatBriefingDate(date)}</Text>
          {section?.headline ? <Text style={styles.headline}>{section.headline}</Text> : null}
        </View>
        <Pressable onPress={() => router.push('/briefings')} accessibilityRole="button" accessibilityLabel="Open Briefings">
          <Text style={styles.link}>See all</Text>
        </Pressable>
      </View>
      <View style={styles.tabs}>
        {(['personal', 'crankcase'] as const).map((key) => (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === key }}
            style={[styles.tab, tab === key && styles.tabOn]}>
            <Text style={[styles.tabText, tab === key && styles.tabTextOn]}>
              {key === 'personal' ? 'Personal' : 'Crankcase'}
            </Text>
          </Pressable>
        ))}
      </View>
      {items.length === 0 ? (
        <Text style={styles.empty}>Nothing in this list.</Text>
      ) : (
        items.map((item) => (
          <BriefingCard
            key={item.threadId}
            item={item}
            date={date}
            account={tab}
            deckName={section?.deckName ?? (tab === 'personal' ? 'Personal' : 'Crankcase')}
            compact
            send={send}
          />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
    gap: 10,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  headText: { flex: 1, gap: 2 },
  kicker: { fontSize: 12, fontWeight: '600', letterSpacing: 0.4, color: '#c2410c', textTransform: 'uppercase' },
  title: { fontSize: 18, fontWeight: '700', color: '#1f2430' },
  headline: { fontSize: 14, lineHeight: 20, color: '#6b7280', marginTop: 2 },
  link: { fontSize: 14, fontWeight: '600', color: '#0a7ea4', paddingTop: 2 },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
  },
  tabOn: { backgroundColor: '#fff7ed' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  tabTextOn: { color: '#c2410c' },
  empty: { fontSize: 14, color: '#6b7280' },
});
