import { useAction, useQuery } from 'convex/react';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BriefingCard } from '@/components/briefing/card';
import { api } from '@/lib/api';
import { formatBriefingDate } from '@/lib/briefing-gesture';
import { isClerkConfigured } from '@/lib/convex';
import { useRefreshSpinner } from '@/lib/use-refresh';
import { restLine, type AccountBriefing, type BriefingAccount } from '../../../server/convex/briefings/payload';

const PAGE = '#f7f7f4';
const TEXT = '#1f2430';
const MUTED = '#6b7280';
const ORANGE = '#c2410c';
const BORDER = '#e5e7eb';
const SOFT = '#fff7ed';
const MAX = 720;

export default function BriefingsScreen() {
  if (!isClerkConfigured()) return null;
  return <BriefingsPage />;
}

function BriefingsPage() {
  const allowed = useQuery(api.briefings.queries.isAllowed);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const dates = useQuery(api.briefings.queries.listDates, allowed ? { refreshNonce } : 'skip');
  const [date, setDate] = useState<string | null>(null);
  const [tab, setTab] = useState<BriefingAccount>('personal');
  const day = useQuery(
    api.briefings.queries.getDay,
    allowed && date ? { date, refreshNonce } : 'skip',
  );
  const send = useAction(api.briefings.feedback.send);

  useEffect(() => {
    if (!dates?.length) return;
    if (!date || !dates.some((row) => row.date === date)) setDate(dates[0].date);
  }, [date, dates]);

  const { refreshing, onRefresh } = useRefreshSpinner(
    allowed === false || (dates !== undefined && (!date || day !== undefined)),
    () => setRefreshNonce((nonce) => nonce + 1),
  );

  if (allowed === undefined) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={ORANGE} />
      </View>
    );
  }

  if (!allowed) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Briefings</Text>
        <Text style={styles.muted}>This section is not available for this account.</Text>
      </View>
    );
  }

  const section: AccountBriefing | null = day ? day[tab] : null;
  const selected = dates?.find((row) => row.date === date);

  return (
    <View style={styles.page}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <View style={styles.column}>
            <Text style={styles.kicker}>Private</Text>
            <Text style={styles.title}>Briefings</Text>
            <Text style={styles.sub}>Daily email brief · Personal and Crankcase</Text>

            {dates && dates.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dates}>
                {dates.map((row) => {
                  const active = row.date === date;
                  return (
                    <Pressable
                      key={row.date}
                      onPress={() => setDate(row.date)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`Briefing ${row.date}`}
                      style={[styles.dateChip, active && styles.dateChipOn]}
                    >
                      <Text style={[styles.dateChipDay, active && styles.dateChipOnText]}>{row.date}</Text>
                      <Text style={[styles.dateChipMeta, active && styles.dateChipOnText]}>
                        {formatBriefingDate(row.date)}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No briefings yet.</Text>
              </View>
            )}

            {date ? (
              <View style={styles.tabs} accessibilityRole="tablist">
                {(['personal', 'crankcase'] as const).map((key) => {
                  const active = tab === key;
                  const count = key === 'personal' ? selected?.personalPriorities ?? 0 : selected?.crankcasePriorities ?? 0;
                  return (
                    <Pressable
                      key={key}
                      onPress={() => setTab(key)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                      style={[styles.tab, active && styles.tabOn]}
                    >
                      <Text style={[styles.tabLabel, active && styles.tabLabelOn]}>
                        {key === 'personal' ? 'Personal' : 'Crankcase'}
                      </Text>
                      <View style={[styles.badge, active && styles.badgeOn]}>
                        <Text style={[styles.badgeText, active && styles.badgeTextOn]}>{count}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {date && !day ? (
              <ActivityIndicator color={ORANGE} />
            ) : section ? (
              <View style={styles.pane}>
                <Text style={styles.headline}>{section.headline}</Text>
                {section.sub ? <Text style={styles.lede}>{section.sub}</Text> : null}

                <Text style={styles.h2}>{section.priorityHeading ?? 'Top priorities'}</Text>
                {section.priorities.length === 0 ? (
                  <View style={styles.empty}>
                    <Text style={styles.emptyText}>Nothing in this list.</Text>
                  </View>
                ) : (
                  <View style={styles.list}>
                    {section.priorities.map((item) => (
                      <BriefingCard
                        key={item.threadId}
                        item={item}
                        date={date!}
                        account={tab}
                        deckName={section.deckName}
                        send={send}
                      />
                    ))}
                  </View>
                )}

                <Text style={styles.h2}>{section.glanceHeading ?? 'Worth a glance'}</Text>
                {section.glance.length === 0 ? (
                  <View style={styles.empty}>
                    <Text style={styles.emptyText}>Nothing in this list.</Text>
                  </View>
                ) : (
                  <View style={styles.list}>
                    {section.glance.map((item) => (
                      <BriefingCard
                        key={item.threadId}
                        item={item}
                        date={date!}
                        account={tab}
                        deckName={section.deckName}
                        compact
                        send={send}
                      />
                    ))}
                  </View>
                )}

                <Text style={styles.rest}>{restLine(section)}</Text>
              </View>
            ) : date ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No {tab} briefing for this date.</Text>
              </View>
            ) : null}

            {dates ? (
              <Text style={styles.footer}>
                {dates.length} date{dates.length === 1 ? '' : 's'}, newest first.
              </Text>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: PAGE },
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: PAGE, gap: 8 },
  scroll: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 56 },
  column: { width: '100%', maxWidth: MAX, alignSelf: 'center', gap: 14 },
  kicker: { color: MUTED, fontSize: 11, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' },
  title: { color: TEXT, fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  sub: { color: MUTED, fontSize: 14 },
  muted: { color: MUTED, textAlign: 'center' },
  dates: { gap: 8, paddingVertical: 4 },
  dateChip: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  dateChipOn: { backgroundColor: SOFT, borderColor: ORANGE },
  dateChipDay: { color: TEXT, fontWeight: '700', fontSize: 13 },
  dateChipMeta: { color: MUTED, fontSize: 11 },
  dateChipOnText: { color: ORANGE },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabOn: { borderBottomColor: ORANGE },
  tabLabel: { color: MUTED, fontSize: 15, fontWeight: '600' },
  tabLabelOn: { color: ORANGE },
  badge: { backgroundColor: BORDER, borderRadius: 999, minWidth: 22, paddingHorizontal: 6, paddingVertical: 2 },
  badgeOn: { backgroundColor: ORANGE },
  badgeText: { color: MUTED, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  badgeTextOn: { color: '#fff' },
  pane: { gap: 12 },
  headline: { color: ORANGE, fontSize: 17, fontWeight: '700' },
  lede: { color: MUTED, fontSize: 14 },
  h2: {
    color: MUTED,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 6,
  },
  list: { gap: 10 },
  empty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: BORDER,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
  },
  emptyText: { color: MUTED },
  rest: { color: MUTED, fontSize: 13, lineHeight: 18 },
  footer: { color: MUTED, fontSize: 12, textAlign: 'center', marginTop: 8 },
});
