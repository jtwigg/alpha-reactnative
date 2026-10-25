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
import { ChartToggles } from '@/components/finance/chart-toggles';
import { TwrCard } from '@/components/finance/twr-card';
import {
  counterpartLabel,
  flowTargetAccount,
  IncompleteDepositBadge,
  incompleteDeposit,
  TwrChart,
  TwrHeader,
} from '@/components/finance/twr-chart';
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
  StateMessage,
  useFinancePalette,
} from '@/components/finance/ui';
import { useFinanceAccess } from '@/hooks/use-finance-access';
import { api } from '@/lib/api';
import { useChartColors } from '@/lib/finance-colors';
import { RANGE_SUFFIX, isDailyRange } from '@/lib/range-support';
import { useCachedValue } from '@/lib/finance-cache';
import { seriesFromPack, type SeriesPack } from '@/lib/finance-packs';
import { useRefreshSpinner } from '@/lib/use-refresh';
import { useFinanceDemo } from '@/lib/finance-demo';
import { useChartMode } from '@/lib/chart-mode';
import { demoAccountDetail, demoFlows, demoHoldings, demoTransactions, demoTwr } from '@/lib/finance-fixtures';
import { BENCHMARKS } from '../../../../server/convex/finance/benchmarks';
import { groupKeyForClass, trimHistoryToRange } from '../../../../server/convex/finance/accountModel';
import { accountScope } from '../../../../server/convex/finance/twrModel';
import { flowAdjustedOverlay } from '../../../../server/convex/finance/seriesModel';
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
  const { timeWeighted, setTimeWeighted, showSp500, setShowSp500 } = useChartMode();
  const scope = accountScope(sourceId);

  const [visited, setVisited] = useState<Set<RangeKey>>(() => new Set(['All', range]));
  useEffect(() => {
    setVisited((current) => {
      if (current.has(range)) return current;
      const next = new Set(current);
      next.add(range);
      return next;
    });
  }, [range]);
  const liveDetail = useQuery(
    api.finance.accounts.detail,
    live ? { sourceId, range: 'All', refreshNonce } : 'skip',
  );
  const detail1M = useQuery(
    api.finance.accounts.detail,
    live && visited.has('1M') ? { sourceId, range: '1M', refreshNonce } : 'skip',
  );
  const detail3M = useQuery(
    api.finance.accounts.detail,
    live && visited.has('3M') ? { sourceId, range: '3M', refreshNonce } : 'skip',
  );
  const detailYtd = useQuery(
    api.finance.accounts.detail,
    live && visited.has('YTD') ? { sourceId, range: 'YTD', refreshNonce } : 'skip',
  );
  const detail1Y = useQuery(
    api.finance.accounts.detail,
    live && visited.has('1Y') ? { sourceId, range: '1Y', refreshNonce } : 'skip',
  );
  const detail5Y = useQuery(
    api.finance.accounts.detail,
    live && visited.has('5Y') ? { sourceId, range: '5Y', refreshNonce } : 'skip',
  );
  const fineDetail = useQuery(
    api.finance.accounts.detail,
    live && isDailyRange(range) ? { sourceId, range, refreshNonce } : 'skip',
  );
  const liveSeriesPack = useQuery(api.finance.queries.seriesPack, live ? { scope, refreshNonce } : 'skip');
  const seriesPack = useCachedValue<SeriesPack>(`finance.seriesPack.${scope}`, liveSeriesPack ?? undefined);
  const liveSeries = useQuery(
    api.finance.queries.series,
    live && seriesPack == null ? { scope, range, refreshNonce } : 'skip',
  );
  const liveTwr = useQuery(api.finance.queries.twr, live ? { scope, refreshNonce } : 'skip');
  const liveFlows = useQuery(api.finance.queries.flows, live ? { accountId: sourceId, refreshNonce } : 'skip');
  const demoSeriesModel = useMemo(() => (live ? undefined : demoTwr(scope, range)), [live, range, scope]);
  const flowMarks = useMemo(() => {
    const rows = live ? (liveFlows ?? []) : demoFlows(sourceId);
    return rows.map((flow) => ({
      flowId: flow.flowId,
      date: flow.date,
      amount: flow.amount,
      counterpartLabel: counterpartLabel(flow),
      onPress: () => {
        const target = flowTargetAccount(flow);
        if (target) router.push(`/finances/account/${encodeURIComponent(target)}`);
      },
    }));
  }, [live, liveFlows, router, sourceId]);
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
    const byRange = { '1M': detail1M, '3M': detail3M, YTD: detailYtd, '1Y': detail1Y, '5Y': detail5Y, All: liveDetail };
    const hit = byRange[range];
    if (hit && hit.history.range === range) return hit;
    const source = liveDetail ?? held;
    if (source === undefined || source === null) return source;
    if (fineDetail && fineDetail.history.range === range) return fineDetail;
    return { ...source, history: trimHistoryToRange(source.history, range) };
  }, [detail1M, detail1Y, detail3M, detail5Y, detailYtd, fineDetail, held, live, liveDetail, range, sourceId]);

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

  const group = groupKeyForClass(detail.class);
  const color = colors.groups[group];
  const balance = detail.latestSnapshot?.balance ?? detail.currentBalance;
  const shown = signedAmount(detail.class, balance);
  const packedSeries = seriesPack ? seriesFromPack(seriesPack, range) : null;
  const seriesPoints = live
    ? (packedSeries?.points ?? liveSeries?.points ?? [])
    : (demoSeriesModel?.series ?? []);
  const hasSeries = seriesPoints.length >= 2;
  const twrOn = timeWeighted;
  const sp500On = showSp500 && group !== 'liability';
  const twrWindows = live ? (liveTwr?.windows ?? []) : (demoSeriesModel?.windows ?? []);
  const depositIncomplete = incompleteDeposit(twrWindows);
  const depositNote = twrWindows.find((row) => row.note)?.note ?? null;

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
            {twrOn ? (
              <>
                <HeroValue
                  label="Value"
                  points={seriesPoints.map((point) => ({ asOf: point.asOf, total: point.value }))}
                  scrubIndex={scrubIndex}
                  fallback={seriesPoints.at(-1)?.value ?? balance}
                  suffix={RANGE_SUFFIX[range]}
                />
                <TwrHeader
                  twr={live ? (packedSeries?.twr ?? liveSeries?.twr ?? null) : (demoSeriesModel?.twr ?? null)}
                  sp500Twr={
                    live ? (packedSeries?.sp500Twr ?? liveSeries?.sp500Twr ?? null) : (demoSeriesModel?.sp500Twr ?? null)
                  }
                  showSp500={sp500On}
                />
                {depositIncomplete ? <IncompleteDepositBadge note={depositNote} /> : null}
                {live && packedSeries == null && liveSeries === undefined ? (
                  <ActivityIndicator />
                ) : (
                  <TwrChart
                    points={seriesPoints}
                    height={width >= 720 ? 260 : 210}
                    showSp500={sp500On}
                    rebaseSp500={range !== 'All'}
                    color={color}
                    scrubIndex={scrubIndex}
                    onScrub={setScrubIndex}
                    flows={flowMarks}
                  />
                )}
              </>
            ) : (
              <>
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
                  showBenchmark={sp500On}
                  seriesLabel="Balance"
                  color={color}
                  height={width >= 720 ? 260 : 210}
                  invert={shown < 0}
                  spanFrom={live ? (liveDetail ?? held)?.history.points[0]?.asOf : detail.history.points[0]?.asOf}
                  spanTo={live ? (liveDetail ?? held)?.history.asOf : detail.history.asOf}
                  flowAdjusted={
                    hasSeries
                      ? {
                          label: BENCHMARKS.SPX.label,
                          color: colors.benchmark,
                          values: flowAdjustedOverlay(
                            detail.history.points.map((point) => point.asOf),
                            detail.history.points[0]?.total ?? 0,
                            seriesPoints,
                          ),
                        }
                      : undefined
                  }
                />
              </>
            )}
            <View style={styles.toolbar}>
              <RangePills value={range} onChange={setRange} stretch />
              <ChartToggles
                timeWeighted={timeWeighted}
                onTimeWeighted={setTimeWeighted}
                showSp500={showSp500}
                onShowSp500={setShowSp500}
                showSp500Toggle={group !== 'liability'}
              />
            </View>
          </Card>

          {group === 'investments' ? (
            <TwrCard
              live={live}
              demo={live ? undefined : { flows: demoFlows(sourceId) }}
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
