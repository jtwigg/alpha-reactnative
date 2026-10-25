import { useAction, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
import { QueryErrorBoundary } from '@/components/query-error-boundary';
import { LinkNotFound } from '@/components/link-not-found';
import { api } from '@/lib/api';
import { briefingsPath, findBriefingItem, parseBriefingDate, parseBriefingItemRef } from '@/lib/app-links';
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

export function BriefingsScreen() {
  if (!isClerkConfigured()) return null;
  return (
    <QueryErrorBoundary surface="briefings">
      <BriefingsPage />
    </QueryErrorBoundary>
  );
}

function BriefingsPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string; itemId?: string }>();
  const dateParam = typeof params.date === 'string' ? params.date : null;
  const itemParam = typeof params.itemId === 'string' ? params.itemId : null;
  const parsedDate = dateParam ? parseBriefingDate(dateParam) : null;
  const dateMalformed = Boolean(dateParam && !parsedDate);
  const itemRef = itemParam ? parseBriefingItemRef(itemParam, parsedDate) : null;
  const itemMalformed = Boolean(itemParam && !itemRef);

  const allowed = useQuery(api.briefings.queries.isAllowed);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const dates = useQuery(api.briefings.queries.listDates, allowed ? { refreshNonce } : 'skip');
  const [pickedDate, setPickedDate] = useState<string | null>(parsedDate);
  const [tab, setTab] = useState<BriefingAccount>(itemRef?.account ?? 'personal');
  const date = parsedDate ?? pickedDate;
  const dateMissing = Boolean(dates && parsedDate && !dates.some((row) => row.date === parsedDate));
  const day = useQuery(
    api.briefings.queries.getDay,
    allowed && date && !dateMalformed && !dateMissing ? { date, refreshNonce } : 'skip',
  );
  const send = useAction(api.briefings.feedback.send);
  const match = day && itemRef ? findBriefingItem(day, itemRef) : null;
  const itemMissing = Boolean(day && itemRef && !match);
  const scrollRef = useRef<ScrollView>(null);
  const highlightY = useRef(0);

  useEffect(() => {
    if (itemRef?.account) setTab(itemRef.account);
  }, [itemRef?.account]);

  useEffect(() => {
    if (match) setTab(match.account);
  }, [match]);

  useEffect(() => {
    if (parsedDate) {
      setPickedDate(parsedDate);
      return;
    }
    if (!dates?.length) return;
    if (!pickedDate || !dates.some((row) => row.date === pickedDate)) setPickedDate(dates[0].date);
  }, [parsedDate, pickedDate, dates]);

  const { refreshing, onRefresh } = useRefreshSpinner(
    allowed === false || (dates !== undefined && (!date || dateMissing || day !== undefined)),
    () => setRefreshNonce((nonce) => nonce + 1),
  );

  const openDate = (next: string) => {
    setPickedDate(next);
    router.replace(briefingsPath(next) as Href);
  };

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

  if (dateMalformed || itemMalformed) {
    return (
      <LinkNotFound
        title="Link not found"
        body="That briefing link is not a date or item id Alpha recognizes."
        href="/briefings"
        label="Back to Briefings"
      />
    );
  }

  if (dateMissing) {
    return (
      <LinkNotFound
        title="Briefing not found"
        body="No briefing exists for that date."
        href="/briefings"
        label="Back to Briefings"
      />
    );
  }

  const section: AccountBriefing | null = day ? day[tab] : null;
  const selected = dates?.find((row) => row.date === date);
  const highlightId = match?.item.threadId ?? null;

  return (
    <View style={styles.page}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <View style={styles.column}>
            <Text style={styles.kicker}>Private</Text>
            <Text style={styles.title}>Briefings</Text>
            <Text style={styles.sub}>Daily email brief · Personal and Crankcase</Text>

            {itemMissing ? (
              <View style={styles.missing} accessibilityRole="alert">
                <Text style={styles.missingTitle}>Item not found</Text>
                <Text style={styles.missingBody}>That item id is not in this briefing.</Text>
              </View>
            ) : null}

            {dates && dates.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dates}>
                {dates.map((row) => {
                  const active = row.date === date;
                  return (
                    <Pressable
                      key={row.date}
                      onPress={() => openDate(row.date)}
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
                      <View
                        key={item.threadId}
                        onLayout={(event) => {
                          if (item.threadId === highlightId) {
                            highlightY.current = event.nativeEvent.layout.y;
                            scrollRef.current?.scrollTo({ y: Math.max(0, highlightY.current - 24), animated: true });
                          }
                        }}
                      >
                        <BriefingCard
                          item={item}
                          date={date!}
                          account={tab}
                          deckName={section.deckName}
                          send={send}
                          highlighted={item.threadId === highlightId}
                        />
                      </View>
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
                      <View
                        key={item.threadId}
                        onLayout={(event) => {
                          if (item.threadId === highlightId) {
                            highlightY.current = event.nativeEvent.layout.y;
                            scrollRef.current?.scrollTo({ y: Math.max(0, highlightY.current - 24), animated: true });
                          }
                        }}
                      >
                        <BriefingCard
                          item={item}
                          date={date!}
                          account={tab}
                          deckName={section.deckName}
                          compact
                          send={send}
                          highlighted={item.threadId === highlightId}
                        />
                      </View>
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
  missing: {
    borderWidth: 1,
    borderColor: '#fdba74',
    backgroundColor: SOFT,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  missingTitle: { color: ORANGE, fontWeight: '700' },
  missingBody: { color: MUTED, fontSize: 14 },
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
