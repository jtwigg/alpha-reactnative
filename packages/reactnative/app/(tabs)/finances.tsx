import { useAction, useQuery } from 'convex/react';
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountGroups, GROUP_COLORS, type AccountTrends } from '@/components/finance/account-groups';
import { ClassChart } from '@/components/finance/class-chart';
import { CompositionCard } from '@/components/finance/composition-card';
import { CoverageLegend } from '@/components/finance/coverage-legend';
import { NetWorthChart, type BenchmarkLine } from '@/components/finance/net-worth-chart';
import { RangePills } from '@/components/finance/range-pills';
import {
  Card,
  DeltaBadge,
  FText,
  MAX_CONTENT_WIDTH,
  SectionHeader,
  Segmented,
  StateMessage,
  TABULAR,
  TogglePill,
  useFinancePalette,
} from '@/components/finance/ui';
import { api } from '@/lib/api';
import { isClerkConfigured } from '@/lib/convex';
import { formatCoverageDate, formatUsd } from '@/lib/finance-coverage';
import { isFinanceDemoFlag, useFinanceDemo } from '@/lib/finance-demo';
import { demoAccountList, demoAccountSparklines, demoNetWorthPage } from '@/lib/finance-fixtures';
import {
  BENCHMARKS,
  BENCHMARK_STALE_MS,
  DEFAULT_BENCHMARK,
  benchmarkValuesForDates,
} from '../../../server/convex/finance/benchmarks';
import {
  ACCOUNT_GROUPS,
  groupChartPoints,
  groupKeyForClass,
  type AccountGroupKey,
} from '../../../server/convex/finance/accountModel';
import type { ChartPoint, CoverageMarker, RangeKey } from '../../../server/convex/finance/series';

type ChartGroup = 'all' | AccountGroupKey;

const RANGE_SUFFIX: Record<RangeKey, string> = {
  '1M': 'past month',
  '3M': 'past 3 months',
  YTD: 'year to date',
  '1Y': 'past year',
  All: 'all time',
};

const RANGE_LABEL: Record<RangeKey, string> = {
  '1M': 'past month',
  '3M': 'past 3 months',
  YTD: 'year to date',
  '1Y': 'past year',
  All: 'full history',
};

export default function FinancesScreen() {
  const demo = useFinanceDemo();
  if (!isClerkConfigured() && !demo && !isFinanceDemoFlag()) {
    return null;
  }
  return <NetWorthPage demo={demo} />;
}

function NetWorthPage({ demo }: { demo: boolean }) {
  const palette = useFinancePalette();
  const [range, setRange] = useState<RangeKey>('All');
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);
  const [showBenchmark, setShowBenchmark] = useState(false);
  const [chartGroup, setChartGroup] = useState<ChartGroup>('all');
  const [groupScrub, setGroupScrub] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const chartY = useRef(0);
  const allowed = useQuery(
    api.finance.queries.isAllowed,
    demo && !isClerkConfigured() ? 'skip' : undefined,
  );
  const live = useQuery(api.finance.queries.page, allowed ? { range, refreshNonce } : 'skip');
  const liveAccounts = useQuery(api.finance.accounts.list, allowed ? { refreshNonce } : 'skip');
  const [held, setHeld] = useState(live);
  const [heldAccounts, setHeldAccounts] = useState(liveAccounts);
  const liveSparks = useQuery(api.finance.accounts.sparklines, allowed ? { range, refreshNonce } : 'skip');
  const [heldSparks, setHeldSparks] = useState(liveSparks);

  useEffect(() => {
    if (live) setHeld(live);
  }, [live]);
  useEffect(() => {
    if (liveAccounts) setHeldAccounts(liveAccounts);
  }, [liveAccounts]);

  useEffect(() => {
    if (liveSparks) setHeldSparks(liveSparks);
  }, [liveSparks]);

  useEffect(() => {
    if (refreshing && live !== undefined && liveAccounts !== undefined && liveSparks !== undefined) {
      setRefreshing(false);
    }
  }, [live, liveAccounts, liveSparks, refreshing]);

  const hasLive = Boolean(allowed && (live ?? held) && (live ?? held)!.accounts.length > 0);
  const data = useMemo(() => {
    const source = live ?? held;
    if (hasLive) return source;
    if (demo) return demoNetWorthPage(range);
    return source;
  }, [demo, hasLive, held, live, range]);
  const accountList = hasLive ? (liveAccounts ?? heldAccounts) : demo ? demoAccountList() : (liveAccounts ?? heldAccounts);
  const trends = useMemo<AccountTrends>(() => {
    const sparks =
      hasLive || !demo
        ? (liveSparks ?? (heldSparks?.range === range ? heldSparks : undefined))
        : demoAccountSparklines(range);
    return {
      rows: sparks ? new Map(sparks.rows.map((row) => [row.sourceId, row])) : undefined,
      groups: sparks?.groups ? new Map(sparks.groups.map((row) => [row.key, row])) : undefined,
      rangeLabel: RANGE_SUFFIX[range],
    };
  }, [demo, hasLive, heldSparks, liveSparks, range]);

  useEffect(() => {
    setScrubIndex(null);
    setGroupScrub(null);
  }, [range, chartGroup]);

  const groupOptions = useMemo<ChartGroup[]>(() => {
    const present = new Set(accountList?.groups.map((group) => group.key) ?? []);
    return ['all', ...ACCOUNT_GROUPS.map((group) => group.key).filter((key) => present.has(key))];
  }, [accountList]);
  const activeGroup: ChartGroup = groupOptions.includes(chartGroup) ? chartGroup : 'all';

  const selectGroupFromList = (key: AccountGroupKey | null) => {
    setChartGroup(key ?? 'all');
    if (key) scrollRef.current?.scrollTo({ y: Math.max(chartY.current - 12, 0), animated: true });
  };

  const onRefresh = () => {
    setRefreshing(true);
    setRefreshNonce((nonce) => nonce + 1);
    if (demo && !allowed) {
      setTimeout(() => setRefreshing(false), 400);
    }
  };

  if (!demo && allowed === undefined && !held) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.page }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!demo && allowed === false) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.page }]}>
        <StateMessage title="Personal finances" body="This section is not available for this account." />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.page }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const usingDemo = demo && !hasLive;

  return (
    <View style={[styles.flex, { backgroundColor: palette.page }]}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
          <View style={styles.column}>
            <View style={styles.header}>
              <FText variant="eyebrow" tone="muted">
                Personal finances
              </FText>
              <FText variant="title">Net worth</FText>
            </View>

            {usingDemo ? (
              <View style={styles.demoBanner}>
                <FText variant="caption" style={styles.demoText}>
                  Sample data for layout only — invented accounts, not real balances.
                </FText>
              </View>
            ) : null}

            <Card>
              <View style={styles.heroTop}>
                <View style={styles.heroValue}>
                  <FText variant="display" style={TABULAR}>
                    {formatUsd(data.headline)}
                  </FText>
                  <DeltaBadge amount={data.change} pct={data.changePct} suffix={RANGE_SUFFIX[range]} />
                </View>
                <FText variant="caption" tone="subtle">
                  As of {formatCoverageDate(data.asOf)}
                </FText>
              </View>
              <View style={[styles.stats, { borderTopColor: palette.hairline }]}>
                <Stat label="Assets" value={formatUsd(data.assets)} />
                <View style={[styles.statDivider, { backgroundColor: palette.hairline }]} />
                <Stat label="Loans" value={formatUsd(data.liabilities)} negative={data.liabilities < 0} />
              </View>
            </Card>

            <View onLayout={(event) => (chartY.current = event.nativeEvent.layout.y)}>
              <Card>
                <View style={styles.toolbar}>
                  <RangePills value={range} onChange={setRange} />
                  {allowed && activeGroup !== 'liability' ? (
                    <TogglePill
                      label={BENCHMARKS.SPX.label}
                      value={showBenchmark}
                      onChange={setShowBenchmark}
                      color={BENCHMARKS.SPX.color}
                    />
                  ) : null}
                </View>
                {groupOptions.length > 2 ? (
                  <View style={styles.groupPicker}>
                    <Segmented
                      options={groupOptions}
                      value={activeGroup}
                      onChange={setChartGroup}
                      labels={GROUP_PICKER_LABELS}
                      accessibilityLabel="Chart group"
                    />
                  </View>
                ) : null}
                {activeGroup === 'all' ? (
                  <ChartBlock
                    points={data.points}
                    markers={data.coverageMarkers}
                    scrubIndex={scrubIndex}
                    onScrub={setScrubIndex}
                    showBenchmark={Boolean(allowed && showBenchmark)}
                  />
                ) : (
                  <GroupChart
                    group={activeGroup}
                    points={data.points}
                    markers={data.coverageMarkers}
                    scrubIndex={groupScrub}
                    onScrub={setGroupScrub}
                    showBenchmark={Boolean(allowed && showBenchmark && activeGroup !== 'liability')}
                    rangeSuffix={RANGE_SUFFIX[range]}
                  />
                )}
              </Card>
            </View>

            <CompositionCard live={hasLive} demo={usingDemo} refreshNonce={refreshNonce} />

            <Card>
              <SectionHeader
                title="By class"
                subtitle="A class starts on its first data point — never drawn as $0."
              />
              <ClassChart points={data.points} scrubIndex={scrubIndex} onScrub={setScrubIndex} />
            </Card>

            <View style={styles.section}>
              <SectionHeader
                title="Accounts"
                subtitle={`Trend lines show the ${RANGE_LABEL[range]}. Tap a group to chart it, or an account for details.`}
                right={
                  accountList ? (
                    <FText variant="headline" style={TABULAR}>
                      {formatUsd(accountList.total)}
                    </FText>
                  ) : null
                }
              />
              {accountList ? (
                <AccountGroups
                  model={accountList}
                  demo={usingDemo}
                  trends={trends}
                  selectedGroup={activeGroup === 'all' ? null : activeGroup}
                  onSelectGroup={selectGroupFromList}
                />
              ) : (
                <Card>
                  <ActivityIndicator />
                </Card>
              )}
            </View>

            <CoverageLegend />
            <FText variant="caption" tone="subtle" style={styles.footnote}>
              Display-only. The Finance agent writes every row; this app never edits balances.
            </FText>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Stat({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (
    <View style={styles.stat}>
      <FText variant="caption" tone="muted">
        {label}
      </FText>
      <FText variant="headline" tone={negative ? 'negative' : 'text'} style={TABULAR}>
        {value}
      </FText>
    </View>
  );
}

const GROUP_PICKER_LABELS: Record<ChartGroup, string> = {
  all: 'All',
  cash: 'Cash',
  investments: 'Investments',
  real_estate: 'Property',
  liability: 'Loans',
  other: 'Other',
};

function GroupChart({
  group,
  points,
  markers,
  scrubIndex,
  onScrub,
  showBenchmark,
  rangeSuffix,
}: {
  group: AccountGroupKey;
  points: ChartPoint[];
  markers: CoverageMarker[];
  scrubIndex: number | null;
  onScrub: (index: number | null) => void;
  showBenchmark: boolean;
  rangeSuffix: string;
}) {
  const filtered = useMemo(() => groupChartPoints(points, group), [group, points]);
  const groupMarkers = useMemo(() => {
    const from = filtered[0]?.asOf;
    return markers.filter(
      (marker) => groupKeyForClass(marker.class) === group && from != null && marker.asOf > from,
    );
  }, [filtered, group, markers]);
  const first = filtered[0]?.total;
  const last = filtered.at(-1)?.total;
  const change = first != null && last != null ? last - first : 0;
  const pct = first != null && last != null && Math.abs(first) >= 0.005 ? change / Math.abs(first) : null;
  const tone = Math.abs(change) < 0.005 ? 'flat' : (change > 0) !== (group === 'liability') ? 'good' : 'bad';
  const label = group === 'liability' ? 'Owed on loans' : GROUP_PICKER_LABELS[group];
  return (
    <View style={styles.groupChart}>
      <View style={styles.groupSummary}>
        <FText variant="caption" tone="muted">
          {label}
        </FText>
        <View style={styles.groupSummaryRow}>
          <FText variant="headline" style={TABULAR}>
            {last != null ? formatUsd(last) : '—'}
          </FText>
          <DeltaBadge amount={change} pct={pct} suffix={rangeSuffix} tone={tone} />
        </View>
      </View>
      <ChartBlock
        points={filtered}
        markers={groupMarkers}
        scrubIndex={scrubIndex}
        onScrub={onScrub}
        showBenchmark={showBenchmark}
        seriesLabel={label}
        color={GROUP_COLORS[group]}
      />
    </View>
  );
}

function ChartBlock({
  points,
  markers,
  scrubIndex,
  onScrub,
  showBenchmark,
  seriesLabel,
  color,
}: {
  points: ChartPoint[];
  markers: CoverageMarker[];
  scrubIndex: number | null;
  onScrub: (index: number | null) => void;
  showBenchmark: boolean;
  seriesLabel?: string;
  color?: string;
}) {
  const chart = (benchmark?: BenchmarkLine) => (
    <NetWorthChart
      points={points}
      markers={markers}
      scrubIndex={scrubIndex}
      onScrub={onScrub}
      benchmark={benchmark}
      seriesLabel={seriesLabel}
      color={color}
    />
  );
  if (!showBenchmark) return chart();
  return (
    <SoftBoundary fallback={chart()}>
      <LiveBenchmarkChart points={points}>{chart}</LiveBenchmarkChart>
    </SoftBoundary>
  );
}

function LiveBenchmarkChart({
  points,
  children,
}: {
  points: ChartPoint[];
  children: (benchmark?: BenchmarkLine) => ReactNode;
}) {
  const from = points[0]?.asOf;
  const to = points[points.length - 1]?.asOf;
  const market = useQuery(
    api.finance.market.series,
    from && to ? { symbol: DEFAULT_BENCHMARK, from, to } : 'skip',
  );
  const ensureMarket = useAction(api.finance.market.ensure);

  useEffect(() => {
    if (market === undefined) return;
    const stale =
      market.bars.length === 0 ||
      market.refreshedAt == null ||
      Date.now() - market.refreshedAt > BENCHMARK_STALE_MS;
    if (!stale) return;
    void ensureMarket({ symbol: DEFAULT_BENCHMARK }).catch(() => undefined);
  }, [ensureMarket, market]);

  const benchmark = useMemo<BenchmarkLine | undefined>(() => {
    if (!market || points.length === 0) return undefined;
    const values = benchmarkValuesForDates(
      points.map((point) => point.asOf),
      points[0].total,
      market.bars,
    );
    if (values.every((value) => value == null)) return undefined;
    return { label: market.label, color: market.color, values };
  }, [market, points]);

  return (
    <>
      {children(benchmark)}
      {market && market.bars.length === 0 ? (
        <FText variant="caption" tone="muted">
          Loading {BENCHMARKS.SPX.label}…
        </FText>
      ) : null}
    </>
  );
}

class SoftBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  scroll: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 56 },
  column: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', gap: 16 },
  header: { gap: 2, paddingHorizontal: 4 },
  heroTop: { gap: 6 },
  heroValue: { gap: 8 },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 14,
  },
  stat: { flex: 1, gap: 2 },
  statDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginHorizontal: 16 },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  section: { gap: 12 },
  groupPicker: { marginTop: 10, alignItems: 'flex-start' },
  groupChart: { gap: 10, marginTop: 4 },
  groupSummary: { gap: 2, marginTop: 8 },
  groupSummaryRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 4 },
  footnote: { textAlign: 'center', paddingHorizontal: 12 },
  demoBanner: {
    backgroundColor: '#FFF4D6',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  demoText: { color: '#7A4E00', fontWeight: '600' },
});
