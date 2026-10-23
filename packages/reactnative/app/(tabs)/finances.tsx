import { useAction, useQuery } from 'convex/react';
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountGroups, CHANGE_MODES, type AccountTrends, type ChangeMode } from '@/components/finance/account-groups';
import { ClassChart } from '@/components/finance/class-chart';
import { CompositionCard } from '@/components/finance/composition-card';
import { CoverageLegend } from '@/components/finance/coverage-legend';
import { HeroValue, changeTone } from '@/components/finance/hero-value';
import { CoverageMarkerNotes, NetWorthChart, type BenchmarkLine } from '@/components/finance/net-worth-chart';
import { RangePills } from '@/components/finance/range-pills';
import {
  Card,
  FText,
  MAX_CONTENT_WIDTH,
  RefreshButton,
  SectionHeader,
  Segmented,
  StateMessage,
  TABULAR,
  TogglePill,
  useFinancePalette,
} from '@/components/finance/ui';
import { api } from '@/lib/api';
import { isClerkConfigured } from '@/lib/convex';
import { useChartColors } from '@/lib/finance-colors';
import { formatCoverageDate, formatPct, formatUsd } from '@/lib/finance-coverage';
import { isFinanceDemoFlag, useFinanceDemo } from '@/lib/finance-demo';
import { demoAccountList, demoAccountSparklines, demoNetWorthPage } from '@/lib/finance-fixtures';
import { usePersistedChoice } from '@/lib/prefs';
import { liveRange } from '@/lib/range-support';
import { useRefreshSpinner } from '@/lib/use-refresh';
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
import {
  trimModelToRange,
  type ChartPoint,
  type CoverageMarker,
  type RangeKey,
} from '../../../server/convex/finance/series';

type ChartGroup = 'all' | AccountGroupKey;

const RANGE_SUFFIX: Record<RangeKey, string> = {
  '1M': 'past month',
  '3M': 'past 3 months',
  YTD: 'year to date',
  '1Y': 'past year',
  '5Y': 'past 5 years',
  All: 'all time',
};

const RANGE_LABEL: Record<RangeKey, string> = {
  '1M': 'past month',
  '3M': 'past 3 months',
  YTD: 'year to date',
  '1Y': 'past year',
  '5Y': 'past 5 years',
  All: 'full history',
};
const WIDE_MIN_WIDTH = 720;

export default function FinancesScreen() {
  const demo = useFinanceDemo();
  if (!isClerkConfigured() && !demo && !isFinanceDemoFlag()) {
    return null;
  }
  return <NetWorthPage demo={demo} />;
}

function NetWorthPage({ demo }: { demo: boolean }) {
  const palette = useFinancePalette();
  const colors = useChartColors();
  const { width: screenWidth } = useWindowDimensions();
  const [range, setRange] = useState<RangeKey>('All');
  const [changeMode, setChangeMode] = usePersistedChoice<ChangeMode>('finance.changeMode', CHANGE_MODES, 'own');
  const [refreshNonce, setRefreshNonce] = useState(0);
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
  const queryRange = liveRange(range);
  const live = useQuery(api.finance.queries.page, allowed ? { range: queryRange, refreshNonce } : 'skip');
  const liveAccounts = useQuery(api.finance.accounts.list, allowed ? { refreshNonce } : 'skip');
  const [held, setHeld] = useState(live);
  const [heldAccounts, setHeldAccounts] = useState(liveAccounts);
  const liveSparks = useQuery(
    api.finance.accounts.sparklines,
    allowed ? { range: queryRange, refreshNonce } : 'skip',
  );
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

  const { refreshing, onRefresh } = useRefreshSpinner(!allowed || (live !== undefined && liveAccounts !== undefined), () =>
    setRefreshNonce((nonce) => nonce + 1),
  );

  const hasLive = Boolean(allowed && (live ?? held) && (live ?? held)!.accounts.length > 0);
  const data = useMemo(() => {
    const source = live ?? held;
    if (hasLive) {
      return source && source.range === queryRange && queryRange !== range ? trimModelToRange(source, range) : source;
    }
    if (demo) return demoNetWorthPage(range);
    return source;
  }, [demo, hasLive, held, live, queryRange, range]);
  const accountList = hasLive ? (liveAccounts ?? heldAccounts) : demo ? demoAccountList() : (liveAccounts ?? heldAccounts);
  const sparkRange = hasLive || !demo ? queryRange : range;
  const trends = useMemo<AccountTrends>(() => {
    const sparks =
      hasLive || !demo
        ? (liveSparks ?? (heldSparks?.range === sparkRange ? heldSparks : undefined))
        : demoAccountSparklines(sparkRange);
    return {
      rows: sparks ? new Map(sparks.rows.map((row) => [row.sourceId, row])) : undefined,
      groups: sparks?.groups ? new Map(sparks.groups.map((row) => [row.key, row])) : undefined,
      rangeLabel: RANGE_SUFFIX[sparkRange],
      mode: changeMode,
    };
  }, [changeMode, demo, hasLive, heldSparks, liveSparks, sparkRange]);

  useEffect(() => {
    setScrubIndex(null);
    setGroupScrub(null);
  }, [range, chartGroup]);

  const groupOptions = useMemo<ChartGroup[]>(() => {
    const present = new Set(accountList?.groups.map((group) => group.key) ?? []);
    return ['all', ...ACCOUNT_GROUPS.map((group) => group.key).filter((key) => present.has(key))];
  }, [accountList]);
  const activeGroup: ChartGroup = groupOptions.includes(chartGroup) ? chartGroup : 'all';
  const allPoints = data?.points;
  const allMarkers = data?.coverageMarkers;
  const chartPoints = useMemo(() => {
    if (!allPoints) return [];
    return activeGroup === 'all' ? allPoints : groupChartPoints(allPoints, activeGroup);
  }, [activeGroup, allPoints]);
  const chartMarkers = useMemo(() => {
    const from = chartPoints[0]?.asOf;
    if (!allMarkers || from == null) return [];
    return allMarkers.filter(
      (marker) => marker.asOf > from && (activeGroup === 'all' || groupKeyForClass(marker.class) === activeGroup),
    );
  }, [activeGroup, allMarkers, chartPoints]);

  const selectGroupFromList = (key: AccountGroupKey | null) => {
    setChartGroup(key ?? 'all');
    if (key) scrollRef.current?.scrollTo({ y: Math.max(chartY.current - 12, 0), animated: true });
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
  const heroScrub = activeGroup === 'all' ? scrubIndex : groupScrub;
  const rangeChange = (chartPoints.at(-1)?.total ?? 0) - (chartPoints[0]?.total ?? 0);
  const lineColor =
    activeGroup !== 'all'
      ? colors.groups[activeGroup]
      : { positive: palette.positive, negative: palette.negative, muted: palette.accent }[changeTone(rangeChange)];

  return (
    <View style={[styles.flex, { backgroundColor: palette.page }]}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
          <View style={styles.column}>
            <View style={styles.headerRow}>
              <View style={styles.header}>
                <FText variant="eyebrow" tone="muted">
                  Personal finances
                </FText>
                <FText variant="title">Net worth</FText>
                <FText variant="caption" tone="subtle">
                  As of {formatCoverageDate(data.asOf)}
                </FText>
              </View>
              <RefreshButton refreshing={refreshing} onRefresh={onRefresh} />
            </View>

            {usingDemo ? (
              <View style={styles.demoBanner}>
                <FText variant="caption" style={styles.demoText}>
                  Sample data for layout only — invented accounts, not real balances.
                </FText>
              </View>
            ) : null}

            <View onLayout={(event) => (chartY.current = event.nativeEvent.layout.y)}>
              <Card style={styles.heroCard}>
                <HeroValue
                  label={activeGroup === 'all' ? undefined : heroLabel(activeGroup)}
                  points={chartPoints}
                  scrubIndex={heroScrub}
                  fallback={data.headline}
                  suffix={RANGE_SUFFIX[range]}
                  invert={activeGroup === 'liability'}
                />
                <ChartBlock
                  points={chartPoints}
                  markers={chartMarkers}
                  scrubIndex={heroScrub}
                  onScrub={activeGroup === 'all' ? setScrubIndex : setGroupScrub}
                  showBenchmark={Boolean(allowed && showBenchmark && activeGroup !== 'liability')}
                  seriesLabel={heroLabel(activeGroup)}
                  color={lineColor}
                  height={screenWidth >= WIDE_MIN_WIDTH ? 280 : 230}
                />
                <RangePills value={range} onChange={setRange} stretch />
                {groupOptions.length > 2 || (allowed && activeGroup !== 'liability') ? (
                  <View style={styles.toolbar}>
                    {groupOptions.length > 2 ? (
                      <Segmented
                        options={groupOptions}
                        value={activeGroup}
                        onChange={setChartGroup}
                        labels={GROUP_PICKER_LABELS}
                        accessibilityLabel="Chart group"
                      />
                    ) : null}
                    {allowed && activeGroup !== 'liability' ? (
                      <TogglePill
                        label={BENCHMARKS.SPX.label}
                        value={showBenchmark}
                        onChange={setShowBenchmark}
                        color={colors.benchmark}
                      />
                    ) : null}
                  </View>
                ) : null}
                <CoverageMarkerNotes markers={chartMarkers} />
                <View style={[styles.stats, { borderTopColor: palette.hairline }]}>
                  <Stat label="Assets" value={formatUsd(data.assets)} />
                  <View style={[styles.statDivider, { backgroundColor: palette.hairline }]} />
                  <Stat label="Loans" value={formatUsd(data.liabilities)} negative={data.liabilities < 0} />
                </View>
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
                subtitle={`Trend lines show the ${RANGE_LABEL[sparkRange]}. Tap a group to chart it, or an account for details.`}
                right={
                  accountList ? (
                    <FText variant="headline" style={TABULAR}>
                      {formatUsd(accountList.total)}
                    </FText>
                  ) : null
                }
              />
              <View style={styles.modeRow}>
                <Segmented
                  options={CHANGE_MODES}
                  value={changeMode}
                  onChange={setChangeMode}
                  labels={CHANGE_MODE_LABELS}
                  accessibilityLabel="Account change"
                />
                <FText variant="caption" tone="subtle" style={styles.modeNote}>
                  {changeMode === 'own' ? 'Each row’s own change' : weightedNote(trends)}
                </FText>
              </View>
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

const CHANGE_MODE_LABELS: Record<ChangeMode, string> = { own: 'Own %', weighted: 'Weighted' };

/** Group contributions sum to the net-worth change; say so with the total. */
function weightedNote(trends: AccountTrends): string {
  const groups = trends.groups ? [...trends.groups.values()] : [];
  if (groups.length === 0 || groups.some((group) => !group.weighted)) {
    return 'Share of the parent’s change, in percentage points';
  }
  const total = groups.reduce((sum, group) => sum + (group.weighted?.pct ?? 0), 0);
  return `Points of change · accounts add up to their group, groups to net worth (${formatPct(total)}). Accounts that start mid-range count from their first balance.`;
}

function heroLabel(group: ChartGroup): string {
  return group === 'all' ? 'Net worth' : group === 'liability' ? 'Owed on loans' : GROUP_PICKER_LABELS[group];
}

function ChartBlock({
  points,
  markers,
  scrubIndex,
  onScrub,
  showBenchmark,
  seriesLabel,
  color,
  height,
}: {
  points: ChartPoint[];
  markers: CoverageMarker[];
  scrubIndex: number | null;
  onScrub: (index: number | null) => void;
  showBenchmark: boolean;
  seriesLabel?: string;
  color?: string;
  height?: number;
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
      height={height}
      headline
      showMarkerNotes={false}
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
  const benchmarkColor = useChartColors().benchmark;

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
    return { label: market.label, color: benchmarkColor, values };
  }, [benchmarkColor, market, points]);

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
  header: { flex: 1, gap: 2, paddingHorizontal: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  heroCard: { gap: 16 },
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
  modeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  modeNote: { flexShrink: 1 },
  footnote: { textAlign: 'center', paddingHorizontal: 12 },
  demoBanner: {
    backgroundColor: '#FFF4D6',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  demoText: { color: '#7A4E00', fontWeight: '600' },
});
