import { usePaginatedQuery, useQuery } from 'convex/react';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import {
  DetailsCard,
  HoldingsCard,
  TransactionsCard,
  accountFields,
  type TransactionsStatus,
} from '@/components/finance/account-sections';
import { ChartBlock } from '@/components/finance/benchmark-chart';
import { TwrCard } from '@/components/finance/twr-card';
import { HeroValue } from '@/components/finance/hero-value';
import { RangePills } from '@/components/finance/range-pills';
import { useScrollLockRoot } from '@/components/finance/scroll-lock';
import {
  Avatar,
  Badge,
  Card,
  FText,
  MAX_CONTENT_WIDTH,
  RefreshButton,
  TogglePill,
  StateMessage,
  useFinancePalette,
} from '@/components/finance/ui';
import { useFinanceAccess } from '@/hooks/use-finance-access';
import { api } from '@/lib/api';
import { useChartColors } from '@/lib/finance-colors';
import { RANGE_SUFFIX, isDailyRange } from '@/lib/range-support';
import { useRefreshSpinner } from '@/lib/use-refresh';
import { useFinanceDemo } from '@/lib/finance-demo';
import { demoAccountDetail, demoFlows, demoHoldings, demoTransactions, demoTwr } from '@/lib/finance-fixtures';
import { BENCHMARKS } from '../../../../server/convex/finance/benchmarks';
import { groupKeyForClass, trimHistoryToRange } from '../../../../server/convex/finance/accountModel';
import { accountScope } from '../../../../server/convex/finance/twrModel';
import { signedAmount, type RangeKey } from '../../../../server/convex/finance/series';

const PAGE_SIZE = 25;

export default function AccountDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const sourceId = decodeURIComponent(String(params.id ?? ''));
  const demo = useFinanceDemo();
  const access = useFinanceAccess(demo);
  const palette = useFinancePalette();

  const screen = (
    <Stack.Screen
      options={{
        title: '',
        headerBackTitle: 'Finances',
        headerShadowVisible: false,
        headerStyle: { backgroundColor: palette.page },
        headerTintColor: palette.accent,
      }}
    />
  );

  if (access === 'signed-out') return <Redirect href="/sign-in" />;
  if (access === 'loading') {
    return (
      <View style={[styles.centered, { backgroundColor: palette.page }]}>
        {screen}
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (access === 'denied') {
    return (
      <View style={[styles.centered, { backgroundColor: palette.page }]}>
        {screen}
        <StateMessage title="Not available" body="Finances are not available for this account." />
      </View>
    );
  }
  return (
    <>
      {screen}
      <AccountDetailBody sourceId={sourceId} live={access === 'allowed'} />
    </>
  );
}

function AccountDetailBody({ sourceId, live }: { sourceId: string; live: boolean }) {
  const palette = useFinancePalette();
  const colors = useChartColors();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const [range, setRange] = useState<RangeKey>('1Y');
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);
  const [showBenchmark, setShowBenchmark] = useState(false);

  const liveDetail = useQuery(
    api.finance.accounts.detail,
    live ? { sourceId, range: 'All', refreshNonce } : 'skip',
  );
  const fineDetail = useQuery(
    api.finance.accounts.detail,
    live && isDailyRange(range) ? { sourceId, range, refreshNonce } : 'skip',
  );
  const [held, setHeld] = useState(liveDetail);
  useEffect(() => {
    if (liveDetail !== undefined) setHeld(liveDetail);
  }, [liveDetail]);
  const { scrollEnabled, ScrollLockProvider } = useScrollLockRoot();
  const { refreshing, onRefresh } = useRefreshSpinner(!live || liveDetail !== undefined, () =>
    setRefreshNonce((nonce) => nonce + 1),
  );
  useEffect(() => setScrubIndex(null), [range]);

  const detail = useMemo(() => {
    if (!live) {
      const demo = demoAccountDetail(sourceId, 'All');
      if (!demo) return demo;
      return { ...demo, history: trimHistoryToRange(demo.history, range) };
    }
    const source = liveDetail ?? held;
    if (source === undefined || source === null) return source;
    if (fineDetail && fineDetail.history.range === range) return fineDetail;
    return { ...source, history: trimHistoryToRange(source.history, range) };
  }, [fineDetail, held, live, liveDetail, range, sourceId]);

  if (detail === undefined) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.page }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (detail === null) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.page }]}>
        <StateMessage
          title="Account not found"
          body="It may have been merged or removed by the Finance agent."
          action={
            <Pressable onPress={() => router.replace('/finances')} hitSlop={8}>
              <FText tone="accent" variant="callout">
                Back to Finances
              </FText>
            </Pressable>
          }
        />
      </View>
    );
  }

  const color = colors.groups[groupKeyForClass(detail.class)];
  const balance = detail.latestSnapshot?.balance ?? detail.currentBalance;
  const shown = signedAmount(detail.class, balance);

  return (
    <ScrollLockProvider>
      <ScrollView
        scrollEnabled={scrollEnabled}
        style={{ backgroundColor: palette.page }}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.column}>
          <View style={styles.hero}>
            <View style={styles.heroTop}>
              <Avatar label={detail.name} color={color} />
              <View style={styles.flex}>
                <FText variant="eyebrow" tone="muted" numberOfLines={1}>
                  {detail.institution}
                  {detail.mask ? ` · ••${detail.mask}` : ''}
                </FText>
                <FText variant="title" numberOfLines={2}>
                  {detail.name}
                </FText>
              </View>
              <RefreshButton refreshing={refreshing} onRefresh={onRefresh} />
            </View>
            <View style={styles.badges}>
              <Badge label={detail.typeLabel} tone="accent" />
              {detail.provider === 'manual' ? <Badge label="Manual" /> : null}
            </View>
          </View>

          <Card style={styles.historyCard}>
            <HeroValue
              label={shown < 0 ? 'Balance owed' : 'Balance'}
              points={detail.history.points}
              scrubIndex={scrubIndex}
              fallback={balance}
              suffix={RANGE_SUFFIX[range]}
              invert={shown < 0}
            />
            <ChartBlock
              points={detail.history.points}
              markers={[]}
              scrubIndex={scrubIndex}
              onScrub={setScrubIndex}
              showBenchmark={showBenchmark}
              seriesLabel="Balance"
              color={color}
              height={width >= 720 ? 260 : 210}
              invert={shown < 0}
              spanFrom={live ? (liveDetail ?? held)?.history.points[0]?.asOf : detail.history.points[0]?.asOf}
              spanTo={live ? (liveDetail ?? held)?.history.asOf : detail.history.asOf}
            />
            <View style={styles.toolbar}>
              <RangePills value={range} onChange={setRange} stretch />
              <TogglePill
                label={BENCHMARKS.SPX.label}
                value={showBenchmark}
                onChange={setShowBenchmark}
                color={colors.benchmark}
              />
            </View>
          </Card>

          {groupKeyForClass(detail.class) === 'investments' ? (
            <TwrCard
              scope={accountScope(sourceId)}
              live={live}
              demo={live ? undefined : { windows: demoTwr(accountScope(sourceId)).windows, flows: demoFlows(sourceId) }}
              title="Time-weighted return"
              showFlowsFor={sourceId}
              refreshNonce={refreshNonce}
            />
          ) : null}

          <HoldingsSection key={`h-${refreshNonce}`} sourceId={sourceId} live={live} accountValue={balance} />
          <TransactionsSection key={`t-${refreshNonce}`} sourceId={sourceId} live={live} />
          <DetailsCard fields={accountFields(detail)} />
        </View>
      </ScrollView>
    </ScrollLockProvider>
  );
}

function HoldingsSection({ sourceId, live, accountValue }: { sourceId: string; live: boolean; accountValue: number }) {
  const liveHoldings = useQuery(
    api.finance.accounts.holdings,
    live ? { sourceId, accountValue: Math.abs(accountValue) } : 'skip',
  );
  const holdings = live ? liveHoldings : demoHoldings(sourceId);
  if (!holdings) return null;
  return <HoldingsCard holdings={holdings} />;
}

function TransactionsSection({ sourceId, live }: { sourceId: string; live: boolean }) {
  return live ? <LiveTransactions sourceId={sourceId} /> : <DemoTransactions sourceId={sourceId} />;
}

function LiveTransactions({ sourceId }: { sourceId: string }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.finance.accounts.transactions,
    { sourceId },
    { initialNumItems: PAGE_SIZE },
  );
  return (
    <TransactionsCard rows={results} status={status as TransactionsStatus} onLoadMore={() => loadMore(PAGE_SIZE)} />
  );
}

function DemoTransactions({ sourceId }: { sourceId: string }) {
  const all = useMemo(() => demoTransactions(sourceId), [sourceId]);
  const [count, setCount] = useState(PAGE_SIZE);
  return (
    <TransactionsCard
      rows={all.slice(0, count)}
      status={count >= all.length ? 'Exhausted' : 'CanLoadMore'}
      onLoadMore={() => setCount((value) => value + PAGE_SIZE)}
    />
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  scroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 56 },
  column: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', gap: 16 },
  flex: { flex: 1, minWidth: 0 },
  hero: { gap: 10, paddingHorizontal: 4, paddingVertical: 4 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badges: { flexDirection: 'row', gap: 6 },
  historyCard: { gap: 16 },
  toolbar: { gap: 10 },
});
