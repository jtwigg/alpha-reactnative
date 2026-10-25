import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountGroups, CHANGE_MODES, type AccountTrends, type ChangeMode } from '@/components/finance/account-groups';
import { ChartBlock } from '@/components/finance/benchmark-chart';
import { ChartToggles } from '@/components/finance/chart-toggles';
import { ClassChart } from '@/components/finance/class-chart';
import { CompositionCard } from '@/components/finance/composition-card';
import { CoverageLegend } from '@/components/finance/coverage-legend';
import { HeroValue, changeTone } from '@/components/finance/hero-value';
import { CoverageMarkerNotes } from '@/components/finance/net-worth-chart';
import { RangePills } from '@/components/finance/range-pills';
import { useScrollLockRoot } from '@/components/finance/scroll-lock';
import {
  counterpartLabel,
  flowTargetAccount,
  IncompleteDepositBadge,
  incompleteDeposit,
  TwrChart,
  TwrHeader,
} from '@/components/finance/twr-chart';
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
import { useChartMode } from '@/lib/chart-mode';
import { demoAccountList, demoAccountSparklines, demoFlows, demoNetWorthPage, demoTwr } from '@/lib/finance-fixtures';
import { usePersistedChoice } from '@/lib/prefs';
import { RANGE_LABEL, RANGE_SUFFIX, isDailyRange } from '@/lib/range-support';
import { useRefreshSpinner } from '@/lib/use-refresh';
import { BENCHMARKS } from '../../../server/convex/finance/benchmarks';
import {
  ACCOUNT_GROUPS,
  groupChartPoints,
  groupKeyForClass,
  trimSparklinesToRange,
  type AccountGroupKey,
} from '../../../server/convex/finance/accountModel';
import { flowAdjustedOverlay } from '../../../server/convex/finance/seriesModel';
import { modelsForRanges, type RangeKey } from '../../../server/convex/finance/series';

type ChartGroup = 'all' | AccountGroupKey;
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
  const [rangeGen, setRangeGen] = useState(0);
  const [changeMode, setChangeMode] = usePersistedChoice<ChangeMode>('finance.changeMode', CHANGE_MODES, 'own');
  const { timeWeighted, setTimeWeighted, showSp500, setShowSp500, twrAll, setTwrAll } = useChartMode();
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);
  const [chartGroup, setChartGroup] = useState<ChartGroup>('all');
  const [groupScrub, setGroupScrub] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const chartY = useRef(0);
  const allowed = useQuery(api.finance.queries.isAllowed, demo && !isClerkConfigured() ? 'skip' : undefined);
  const live = useQuery(api.finance.queries.page, allowed ? { range: 'All', refreshNonce } : 'skip');
  const fine = useQuery(
    api.finance.queries.page,
    allowed && isDailyRange(range) ? { range, refreshNonce } : 'skip',
  );
  const liveAccounts = useQuery(api.finance.accounts.list, allowed ? { refreshNonce } : 'skip');
  const [held, setHeld] = useState(live);
  const [heldAccounts, setHeldAccounts] = useState(liveAccounts);
  const liveSparks = useQuery(api.finance.accounts.sparklines, allowed ? { range: 'All', refreshNonce } : 'skip');
  const fineSparks = useQuery(
    api.finance.accounts.sparklines,
    allowed && isDailyRange(range) ? { range, refreshNonce } : 'skip',
  );
  const [heldSparks, setHeldSparks] = useState(liveSparks);
  const twrScope = twrAll ? 'total' : 'reliable_subset';
  const router = useRouter();
  const liveSeries = useQuery(
    api.finance.queries.series,
    allowed ? { scope: twrScope, range, refreshNonce } : 'skip',
  );
  const liveTwr = useQuery(api.finance.queries.twr, allowed ? { scope: twrScope, refreshNonce } : 'skip');
  const liveFlows = useQuery(
    api.finance.queries.flows,
    allowed ? { refreshNonce } : 'skip',
  );
  const demoSeriesModel = useMemo(
    () => (demo ? demoTwr(twrScope, range) : undefined),
    [demo, range, twrScope],
  );

  useEffect(() => {
    if (live) setHeld(live);
  }, [live]);
  useEffect(() => {
    if (liveAccounts) setHeldAccounts(liveAccounts);
  }, [liveAccounts]);

  useEffect(() => {
    if (liveSparks) setHeldSparks(liveSparks);
  }, [liveSparks]);

  const { scrollEnabled, ScrollLockProvider } = useScrollLockRoot();
  const { refreshing, onRefresh } = useRefreshSpinner(
    !allowed || (live !== undefined && liveAccounts !== undefined),
    () => setRefreshNonce((nonce) => nonce + 1),
  );

  const full = live ?? held;
  const hasLive = Boolean(allowed && full && full.accounts.length > 0);
  const byRange = useMemo(() => (full ? modelsForRanges(full) : null), [full]);
  const demoByRange = useMemo(() => (demo ? modelsForRanges(demoNetWorthPage('All')) : null), [demo]);
  const data = useMemo(() => {
    if (hasLive) {
      if (fine && fine.range === range) return fine;
      return byRange?.[range] ?? full;
    }
    if (demo) return demoByRange?.[range] ?? demoNetWorthPage(range);
    return full;
  }, [byRange, demo, demoByRange, fine, full, hasLive, range]);
  const accountList = hasLive
    ? (liveAccounts ?? heldAccounts)
    : demo
      ? demoAccountList()
      : (liveAccounts ?? heldAccounts);
  const sparkAccounts = useMemo(
    () => accountList?.groups.flatMap((group) => group.accounts) ?? [],
    [accountList],
  );
  const trends = useMemo<AccountTrends>(() => {
    const sparks = (() => {
      if (hasLive || !demo) {
        if (fineSparks && fineSparks.range === range) return fineSparks;
        const source = liveSparks ?? heldSparks;
        if (!source) return undefined;
        return trimSparklinesToRange(source, range, sparkAccounts);
      }
      return trimSparklinesToRange(demoAccountSparklines('All'), range, sparkAccounts);
    })();
    return {
      rows: sparks ? new Map(sparks.rows.map((row) => [row.sourceId, row])) : undefined,
      groups: sparks?.groups ? new Map(sparks.groups.map((row) => [row.key, row])) : undefined,
      rangeLabel: RANGE_SUFFIX[range],
      mode: changeMode,
    };
  }, [changeMode, demo, fineSparks, hasLive, heldSparks, liveSparks, range, sparkAccounts]);
  const pickRange = (next: RangeKey) => {
    setRange(next);
    setRangeGen((gen) => gen + 1);
  };

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
  const flowMarks = useMemo(() => {
    const rows = hasLive
      ? (liveFlows ?? [])
      : ['acc_brokerage', 'acc_ira', 'acc_roth', 'acc_401k'].flatMap((id) => demoFlows(id));
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
  }, [hasLive, liveFlows, router]);

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
  const seriesPoints = hasLive ? (liveSeries?.points ?? []) : (demoSeriesModel?.series ?? []);
  const hasSeries = seriesPoints.length >= 2;
  const twrOn = timeWeighted && activeGroup === 'all';
  const sp500On = showSp500 && activeGroup !== 'liability';
  const twrWindows = hasLive ? (liveTwr?.windows ?? []) : (demoSeriesModel?.windows ?? []);
  const depositIncomplete = incompleteDeposit(twrWindows);
  const depositNote = twrWindows.find((row) => row.note)?.note ?? null;
  const heroScrub = activeGroup === 'all' ? scrubIndex : groupScrub;
  const rangeChange = (chartPoints.at(-1)?.total ?? 0) - (chartPoints[0]?.total ?? 0);
  const lineColor =
    activeGroup !== 'all'
      ? colors.groups[activeGroup]
      : { positive: palette.positive, negative: palette.negative, muted: palette.accent }[changeTone(rangeChange)];

  return (
    <View style={[styles.flex, { backgroundColor: palette.page }]}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollLockProvider>
          <ScrollView
            ref={scrollRef}
            scrollEnabled={scrollEnabled}
            contentContainerStyle={styles.scroll}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          >
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
                  {twrOn ? (
                    <>
                      <HeroValue
                        label="Value"
                        points={seriesPoints.map((point) => ({ asOf: point.asOf, total: point.value }))}
                        scrubIndex={heroScrub}
                        fallback={seriesPoints.at(-1)?.value ?? data.headline}
                        suffix={RANGE_SUFFIX[range]}
                      />
                      <TwrHeader
                        twr={hasLive ? (liveSeries?.twr ?? null) : (demoSeriesModel?.twr ?? null)}
                        sp500Twr={hasLive ? (liveSeries?.sp500Twr ?? null) : (demoSeriesModel?.sp500Twr ?? null)}
                        showSp500={sp500On}
                      />
                      {depositIncomplete ? <IncompleteDepositBadge note={depositNote} /> : null}
                      {hasLive && liveSeries === undefined ? (
                        <ActivityIndicator />
                      ) : (
                        <TwrChart
                          points={seriesPoints}
                          height={screenWidth >= WIDE_MIN_WIDTH ? 280 : 230}
                          showSp500={sp500On}
                          rebaseSp500={range !== 'All'}
                          color={lineColor}
                          scrubIndex={heroScrub}
                          onScrub={setScrubIndex}
                          flows={flowMarks}
                        />
                      )}
                    </>
                  ) : (
                    <>
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
                        showBenchmark={Boolean(sp500On && (hasLive || usingDemo))}
                        seriesLabel={heroLabel(activeGroup)}
                        color={lineColor}
                        height={screenWidth >= WIDE_MIN_WIDTH ? 280 : 230}
                        invert={activeGroup === 'liability'}
                        spanFrom={full?.points[0]?.asOf}
                        spanTo={full?.asOf}
                        flowAdjusted={
                          hasSeries && activeGroup === 'all'
                            ? {
                                label: BENCHMARKS.SPX.label,
                                color: colors.benchmark,
                                values: flowAdjustedOverlay(
                                  chartPoints.map((point) => point.asOf),
                                  chartPoints[0]?.total ?? 0,
                                  seriesPoints,
                                ),
                              }
                            : undefined
                        }
                      />
                    </>
                  )}
                  <RangePills value={range} onChange={pickRange} stretch />
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
                    <ChartToggles
                      timeWeighted={timeWeighted}
                      onTimeWeighted={setTimeWeighted}
                      showSp500={showSp500}
                      onShowSp500={setShowSp500}
                      showTimeWeighted={activeGroup === 'all'}
                      showSp500Toggle={activeGroup !== 'liability'}
                    />
                    {twrOn ? (
                      <TogglePill
                        label="All accounts"
                        value={twrAll}
                        onChange={setTwrAll}
                        color={palette.accent}
                      />
                    ) : null}
                  </View>
                  <CoverageMarkerNotes markers={chartMarkers} />
                  <View style={[styles.stats, { borderTopColor: palette.hairline }]}>
                    <Stat label="Assets" value={formatUsd(data.assets)} />
                    <View style={[styles.statDivider, { backgroundColor: palette.hairline }]} />
                    <Stat label="Loans" value={formatUsd(data.liabilities)} negative={data.liabilities < 0} />
                  </View>
                </Card>
              </View>

              <CompositionCard
                live={hasLive}
                demo={usingDemo}
                refreshNonce={refreshNonce}
                range={range}
                rangeGen={rangeGen}
              />

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
        </ScrollLockProvider>
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
