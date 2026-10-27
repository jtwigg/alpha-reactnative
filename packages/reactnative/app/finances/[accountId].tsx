import { usePaginatedQuery, useQuery } from 'convex/react';
import { Redirect, Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
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
import { accountPath, parseAccountId, parseRange, signInPath } from '@/lib/app-links';
import { api } from '@/lib/api';
import { useChartColors } from '@/lib/finance-colors';
import { RANGE_SUFFIX } from '@/lib/range-support';
import { FinanceErrorBoundary } from '@/components/finance/error-boundary';
import { QueryErrorBoundary } from '@/components/query-error-boundary';
import { LinkNotFound } from '@/components/link-not-found';
import { useCachedValue } from '@/lib/finance-cache';
import { seriesFromPack, type SeriesPack } from '@/lib/finance-packs';
import {
  DEFAULT_CHART_RANGE,
  shouldFetchAccountRange,
  writeAccountDetail,
  writeSeriesPack,
} from '@/lib/finance-prefetch';
import { useFinancePrefetch } from '@/providers/finance-prefetch';
import { useRefreshSpinner } from '@/lib/use-refresh';
import { useFinanceDemo } from '@/lib/finance-demo';
import { useChartMode } from '@/lib/chart-mode';
import { demoAccountDetail, demoFlows, demoHoldings, demoTransactions, demoTwr } from '@/lib/finance-fixtures';
import { BENCHMARKS } from '../../../server/convex/finance/benchmarks';
import { groupKeyForClass } from '../../../server/convex/finance/accountModel';
import { accountScope } from '../../../server/convex/finance/twrModel';
import { flowAdjustedOverlay } from '../../../server/convex/finance/seriesModel';
import { signedAmount, type RangeKey } from '../../../server/convex/finance/series';

const PAGE_SIZE = 25;

export default function AccountDetailScreen() {
  return (
    <QueryErrorBoundary surface="account">
      <AccountDetailGate />
    </QueryErrorBoundary>
  );
}

function AccountDetailGate() {
  const params = useLocalSearchParams<{ accountId?: string; range?: string }>();
  const sourceId = parseAccountId(params.accountId);
  const rangeFromUrl = parseRange(params.range);
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

  if (!sourceId) {
    return (
      <>
        {screen}
        <LinkNotFound
          title="Account not found"
          body="That account id is not a link Alpha recognizes."
          href="/finances"
          label="Back to Finances"
        />
      </>
    );
  }
  if (access === 'signed-out') {
    return <Redirect href={signInPath(accountPath(sourceId, { range: rangeFromUrl, demo })) as Href} />;
  }
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
      <FinanceErrorBoundary title="Account">
        <AccountDetailBody sourceId={sourceId} live={access === 'allowed'} initialRange={rangeFromUrl} />
      </FinanceErrorBoundary>
    </>
  );
}

function AccountDetailBody({
  sourceId,
  live,
  initialRange,
}: {
  sourceId: string;
  live: boolean;
  initialRange: RangeKey | null;
}) {
  const palette = useFinancePalette();
  const colors = useChartColors();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const prefetch = useFinancePrefetch();
  const [range, setRange] = useState<RangeKey>(initialRange ?? DEFAULT_CHART_RANGE);
  const changeRange = (next: RangeKey) => {
    setRange(next);
    router.setParams({ range: next });
  };
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);
  const [background, setBackground] = useState(false);
  const { timeWeighted, setTimeWeighted, showSp500, setShowSp500 } = useChartMode();
  const scope = accountScope(sourceId);
  const { refreshing, onRefresh } = useRefreshSpinner(!live || prefetch.readAccount(sourceId, range) !== undefined, () => {
    prefetch.refresh();
    setRefreshNonce((nonce) => nonce + 1);
  });

  const want = (next: RangeKey) =>
    shouldFetchAccountRange({
      live,
      range: next,
      selected: range,
      cached: prefetch.readAccount(sourceId, next) !== undefined,
      background,
      refreshing,
    });
  const detail1M = useQuery(
    api.finance.accounts.detail,
    want('1M') ? { sourceId, range: '1M', refreshNonce } : 'skip',
  );
  const detail3M = useQuery(
    api.finance.accounts.detail,
    want('3M') ? { sourceId, range: '3M', refreshNonce } : 'skip',
  );
  const detailYtd = useQuery(
    api.finance.accounts.detail,
    want('YTD') ? { sourceId, range: 'YTD', refreshNonce } : 'skip',
  );
  const detail1Y = useQuery(
    api.finance.accounts.detail,
    want('1Y') ? { sourceId, range: '1Y', refreshNonce } : 'skip',
  );
  const detail5Y = useQuery(
    api.finance.accounts.detail,
    want('5Y') ? { sourceId, range: '5Y', refreshNonce } : 'skip',
  );
  const detailAll = useQuery(
    api.finance.accounts.detail,
    want('All') ? { sourceId, range: 'All', refreshNonce } : 'skip',
  );
  const cachedSeries = prefetch.seriesPack(scope);
  const liveSeriesPack = useQuery(
    api.finance.queries.seriesPack,
    live && !cachedSeries ? { scope, refreshNonce } : 'skip',
  );
  const diskSeries = useCachedValue<SeriesPack>(`finance.seriesPack.${scope}`, liveSeriesPack ?? undefined);
  const seriesPack = cachedSeries ?? diskSeries;
  const packedSeriesEarly = seriesPack ? seriesFromPack(seriesPack, range) : null;
  const liveSeries = useQuery(
    api.finance.queries.series,
    live && packedSeriesEarly == null ? { scope, range, refreshNonce } : 'skip',
  );
  const liveTwr = useQuery(api.finance.queries.twr, live ? { scope, refreshNonce } : 'skip');
  const liveFlows = useQuery(api.finance.queries.flows, live ? { accountId: sourceId, refreshNonce } : 'skip');
  const demoSeriesModel = useMemo(() => (live ? undefined : demoTwr(scope, range)), [live, range, scope]);
  const flowMarks = useMemo(() => {
    const rows = live ? (liveFlows ?? []) : demoFlows(sourceId);
    return rows.map((flow: { flowId: string; date: string; amount: number }) => ({
      flowId: flow.flowId,
      date: flow.date,
      amount: flow.amount,
      counterpartLabel: counterpartLabel(flow),
      onPress: () => {
        const target = flowTargetAccount(flow);
        if (target) router.push(accountPath(target) as Href);
      },
    }));
  }, [live, liveFlows, router, sourceId]);
  const { scrollEnabled, ScrollLockProvider } = useScrollLockRoot();
  useEffect(() => setScrubIndex(null), [range]);

  useEffect(() => {
    if (detail1M !== undefined) writeAccountDetail(prefetch.cache, sourceId, '1M', detail1M);
  }, [detail1M, prefetch.cache, sourceId]);
  useEffect(() => {
    if (detail3M !== undefined) writeAccountDetail(prefetch.cache, sourceId, '3M', detail3M);
  }, [detail3M, prefetch.cache, sourceId]);
  useEffect(() => {
    if (detailYtd !== undefined) writeAccountDetail(prefetch.cache, sourceId, 'YTD', detailYtd);
  }, [detailYtd, prefetch.cache, sourceId]);
  useEffect(() => {
    if (detail1Y !== undefined) writeAccountDetail(prefetch.cache, sourceId, '1Y', detail1Y);
  }, [detail1Y, prefetch.cache, sourceId]);
  useEffect(() => {
    if (detail5Y !== undefined) writeAccountDetail(prefetch.cache, sourceId, '5Y', detail5Y);
  }, [detail5Y, prefetch.cache, sourceId]);
  useEffect(() => {
    if (detailAll !== undefined) writeAccountDetail(prefetch.cache, sourceId, 'All', detailAll);
  }, [detailAll, prefetch.cache, sourceId]);
  useEffect(() => {
    if (liveSeriesPack) writeSeriesPack(prefetch.cache, scope, liveSeriesPack);
  }, [liveSeriesPack, prefetch.cache, scope]);
  useEffect(() => {
    if (!live || background) return;
    const haveSelected = prefetch.readAccount(sourceId, range) !== undefined;
    const haveLive =
      detail1M !== undefined ||
      detail3M !== undefined ||
      detailYtd !== undefined ||
      detail1Y !== undefined ||
      detail5Y !== undefined ||
      detailAll !== undefined;
    if (haveSelected || haveLive) setBackground(true);
  }, [background, detail1M, detail3M, detailAll, detailYtd, detail1Y, detail5Y, live, prefetch, range, sourceId]);

  const liveHit = { '1M': detail1M, '3M': detail3M, YTD: detailYtd, '1Y': detail1Y, '5Y': detail5Y, All: detailAll }[
    range
  ];
  const detail = useMemo(() => {
    if (!live) return demoAccountDetail(sourceId, range);
    const cached = prefetch.readAccount<typeof liveHit>(sourceId, range);
    const hit = cached ?? liveHit;
    if (hit && hit !== null && hit.history.range !== range) return undefined;
    return hit;
  }, [live, liveHit, prefetch, range, sourceId]);

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
  const packedSeries = packedSeriesEarly;
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
                  spanFrom={detail.history.points[0]?.asOf}
                  spanTo={detail.history.asOf}
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
              <RangePills value={range} onChange={changeRange} stretch />
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
