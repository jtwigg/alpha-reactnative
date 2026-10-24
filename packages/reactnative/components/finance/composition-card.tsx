import { useQuery } from 'convex/react';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { RangeNavigator } from '@/components/finance/range-navigator';
import { StackedChart } from '@/components/finance/stacked-chart';
import { Card, FText, SectionHeader, Segmented, StateMessage, TogglePill, useFinancePalette } from '@/components/finance/ui';
import { api } from '@/lib/api';
import { useChartColors } from '@/lib/finance-colors';
import { demoStack } from '@/lib/finance-fixtures';
import { buildStack, windowIndexes, type StackLevel, type StackMode } from '@/lib/stack-math';
import { rangeWindow, type RangeKey } from '../../../server/convex/finance/series';

type Window = { from: string; to: string };
type StackData = ReturnType<typeof demoStack>;

const LEVEL_LABELS: Record<StackLevel, string> = { group: 'Groups', account: 'Accounts' };
const LEVELS: readonly StackLevel[] = ['group', 'account'];
const MODE_LABELS: Record<StackMode, string> = { absolute: 'Absolute', normalized: '100%' };
const MODES: readonly StackMode[] = ['absolute', 'normalized'];

/** Stacked composition chart with a navigator strip over the full history. */
export function CompositionCard({
  live,
  demo,
  refreshNonce,
  range,
  rangeGen,
}: {
  /** Allowlisted and the account list has live data. */
  live: boolean;
  demo: boolean;
  refreshNonce: number;
  /** Page-level range. The stacked chart follows this; no per-chart pills. */
  range: RangeKey;
  rangeGen: number;
}) {
  const palette = useFinancePalette();
  const colors = useChartColors();
  const [level, setLevel] = useState<StackLevel>('group');
  const [includeLoans, setIncludeLoans] = useState(true);
  const [mode, setMode] = useState<StackMode>('absolute');
  const normalized = mode === 'normalized';
  const stackLoans = includeLoans || normalized;
  const [committed, setCommitted] = useState<Window | null>(null);
  const [preview, setPreview] = useState<[number, number] | null>(null);
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);

  const liveOverview = useQuery(api.finance.accounts.stack, live ? { refreshNonce } : 'skip');
  const demoOverview = useMemo(() => (demo ? demoStack() : undefined), [demo]);
  const overview: StackData | undefined = live ? liveOverview : demoOverview;

  const defaultWindow = useMemo<Window | null>(() => {
    if (!overview) return null;
    return rangeWindow(range, overview.asOf, overview.firstAsOf);
  }, [overview, range]);
  const window = committed ?? defaultWindow;

  const liveDetail = useQuery(
    api.finance.accounts.stack,
    live && window ? { from: window.from, to: window.to, refreshNonce } : 'skip',
  );
  const [heldDetail, setHeldDetail] = useState<StackData | undefined>(undefined);
  useEffect(() => {
    if (liveDetail) setHeldDetail(liveDetail);
  }, [liveDetail]);
  const detail = useMemo<StackData | undefined>(() => {
    if (!window) return undefined;
    if (!live) return demo ? demoStack(window.from, window.to) : undefined;
    const candidate = liveDetail ?? heldDetail;
    return candidate && candidate.from === clampFrom(window, overview) && candidate.to === window.to
      ? candidate
      : undefined;
  }, [demo, heldDetail, live, liveDetail, overview, window]);

  const overviewIndexes = useMemo<[number, number] | null>(() => {
    if (!overview || !window) return null;
    return windowIndexes(overview.dates, window.from, window.to);
  }, [overview, window]);
  const navIndexes = preview ?? overviewIndexes;

  const shown = useMemo(() => {
    if (!overview || !navIndexes) return null;
    if (!preview && detail) return { data: detail, coarse: false };
    const [s, e] = navIndexes;
    return {
      data: {
        ...overview,
        dates: overview.dates.slice(s, e + 1),
        accounts: overview.accounts.map((a) => ({ ...a, values: a.values.slice(s, e + 1) })),
      },
      coarse: true,
    };
  }, [detail, navIndexes, overview, preview]);

  const model = useMemo(
    () =>
      shown
        ? buildStack({
            accounts: shown.data.accounts,
            level,
            includeLoans: stackLoans,
            groupColors: colors.groups,
            shade: colors.shade,
          })
        : null,
    [colors, level, shown, stackLoans],
  );
  const overviewLine = useMemo(() => {
    if (!overview) return [];
    const m = buildStack({ accounts: overview.accounts, level: 'group', includeLoans, groupColors: colors.groups });
    return m.net.map((value, i) => (m.covered[i] ? value : null));
  }, [colors, includeLoans, overview]);

  useEffect(() => setScrubIndex(null), [shown, level, includeLoans, mode]);

  useEffect(() => {
    setPreview(null);
    setCommitted(null);
  }, [range, rangeGen]);

  const header = (
    <SectionHeader title="Composition" subtitle="What makes up your net worth over time. Drag the strip below to zoom." />
  );

  if (!overview) {
    return (
      <Card>
        {header}
        {live || demo ? <ActivityIndicator style={styles.loading} /> : null}
      </Card>
    );
  }
  if (overview.accounts.length === 0 || overview.dates.length === 0) {
    return (
      <Card>
        {header}
        <StateMessage title="No history yet" body="The chart fills in once balances are synced." />
      </Card>
    );
  }

  return (
    <Card>
      {header}
      <View style={styles.controls}>
        <View style={styles.toggles}>
          <Segmented options={MODES} value={mode} onChange={setMode} labels={MODE_LABELS} accessibilityLabel="Scale" />
          <Segmented options={LEVELS} value={level} onChange={setLevel} labels={LEVEL_LABELS} accessibilityLabel="Stack by" />
          {normalized ? null : (
            <TogglePill label="Loans" value={includeLoans} onChange={setIncludeLoans} color={colors.groups.liability} />
          )}
        </View>
      </View>
      {shown && model ? (
        <StackedChart
          dates={shown.data.dates}
          model={model}
          mode={mode}
          scrubIndex={scrubIndex}
          onScrub={setScrubIndex}
          netLabel={includeLoans ? 'Net worth' : 'Assets'}
        />
      ) : null}
      <View style={styles.navigator}>
        {navIndexes ? (
          <RangeNavigator
            dates={overview.dates}
            values={overviewLine}
            start={navIndexes[0]}
            end={navIndexes[1]}
            color={palette.accent}
            onChange={(s, e) => setPreview([s, e])}
            onCommit={(s, e) => {
              setPreview(null);
              setCommitted({
                from: overview.dates[s],
                to: e >= overview.dates.length - 1 ? overview.asOf : overview.dates[e],
              });
            }}
          />
        ) : null}
        <FText variant="caption" tone="subtle" style={styles.note}>
          {shown?.coarse && !preview && live ? 'Loading detail… ' : ''}
          {shown?.data.step === 'day' ? 'Daily' : 'Weekly'} bars
          {normalized
            ? ' · share of gross assets; loans shown separately'
            : includeLoans
              ? ' · loans stack below zero'
              : ' · assets only'}
        </FText>
      </View>
    </Card>
  );
}

function clampFrom(window: Window, overview: StackData | undefined): string {
  const first = overview?.firstAsOf;
  return first && window.from < first ? first : window.from;
}

const styles = StyleSheet.create({
  loading: { paddingVertical: 32 },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 12,
    marginBottom: 12,
  },
  toggles: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', flexShrink: 1 },
  navigator: { gap: 6, marginTop: 4 },
  note: { textAlign: 'right' },
});
