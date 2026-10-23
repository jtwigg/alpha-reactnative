import { usePaginatedQuery, useQuery } from 'convex/react';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import {
  DetailsCard,
  HoldingsCard,
  TransactionsCard,
  accountFields,
  type TransactionsStatus,
} from '@/components/finance/account-sections';
import { HeroValue } from '@/components/finance/hero-value';
import { NetWorthChart } from '@/components/finance/net-worth-chart';
import { RangePills } from '@/components/finance/range-pills';
import {
  Avatar,
  Badge,
  Card,
  FText,
  MAX_CONTENT_WIDTH,
  StateMessage,
  useFinancePalette,
} from '@/components/finance/ui';
import { useFinanceAccess } from '@/hooks/use-finance-access';
import { api } from '@/lib/api';
import { useChartColors } from '@/lib/finance-colors';
import { liveRange } from '@/lib/range-support';
import { useFinanceDemo } from '@/lib/finance-demo';
import { demoAccountDetail, demoHoldings, demoTransactions } from '@/lib/finance-fixtures';
import { groupKeyForClass } from '../../../../server/convex/finance/accountModel';
import { signedAmount, type RangeKey } from '../../../../server/convex/finance/series';

const PAGE_SIZE = 25;
const RANGE_SUFFIX: Record<RangeKey, string> = {
  '1M': 'past month',
  '3M': 'past 3 months',
  YTD: 'year to date',
  '1Y': 'past year',
  '5Y': 'past 5 years',
  All: 'all time',
};

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
  const [refreshing, setRefreshing] = useState(false);
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);

  const liveDetail = useQuery(
    api.finance.accounts.detail,
    live ? { sourceId, range: liveRange(range), refreshNonce } : 'skip',
  );
  const [held, setHeld] = useState(liveDetail);
  useEffect(() => {
    if (liveDetail !== undefined) setHeld(liveDetail);
  }, [liveDetail]);
  useEffect(() => {
    if (refreshing && liveDetail !== undefined) setRefreshing(false);
  }, [liveDetail, refreshing]);
  useEffect(() => setScrubIndex(null), [range]);

  const detail = live ? (liveDetail ?? held) : demoAccountDetail(sourceId, range);

  const onRefresh = () => {
    setRefreshing(true);
    setRefreshNonce((nonce) => nonce + 1);
    if (!live) setTimeout(() => setRefreshing(false), 400);
  };

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
    <ScrollView
      style={{ backgroundColor: palette.page }}
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
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
            suffix={RANGE_SUFFIX[live ? liveRange(range) : range]}
            invert={shown < 0}
          />
          <NetWorthChart
            points={detail.history.points}
            markers={[]}
            scrubIndex={scrubIndex}
            onScrub={setScrubIndex}
            seriesLabel="Balance"
            color={color}
            height={width >= 720 ? 260 : 210}
            headline
            showMarkerNotes={false}
          />
          <RangePills value={range} onChange={setRange} stretch />
        </Card>

        <HoldingsSection key={`h-${refreshNonce}`} sourceId={sourceId} live={live} accountValue={balance} />
        <TransactionsSection key={`t-${refreshNonce}`} sourceId={sourceId} live={live} />
        <DetailsCard fields={accountFields(detail)} />
      </View>
    </ScrollView>
  );
}

function HoldingsSection({
  sourceId,
  live,
  accountValue,
}: {
  sourceId: string;
  live: boolean;
  accountValue: number;
}) {
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
    <TransactionsCard
      rows={results}
      status={status as TransactionsStatus}
      onLoadMore={() => loadMore(PAGE_SIZE)}
    />
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
});
