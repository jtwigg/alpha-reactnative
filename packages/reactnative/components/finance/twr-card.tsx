import { useQuery } from 'convex/react';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { TwrChart, TwrHeader, type TwrChartHeader, type TwrChartPoint } from '@/components/finance/twr-chart';
import {
  Badge,
  Card,
  FText,
  SectionHeader,
  TogglePill,
  TABULAR,
  useFinancePalette,
} from '@/components/finance/ui';
import { api } from '@/lib/api';
import { formatCoverageDate, formatUsdSigned } from '@/lib/finance-coverage';
import { TWR_WINDOW_LABELS } from '../../../server/convex/finance/twrModel';
import type { RangeKey } from '../../../server/convex/finance/series';

type TwrRow = {
  window: string;
  asOf: string;
  startDate: string;
  cumulative: number;
  annualized: number | null;
  reliable: boolean;
  flowsFullyKnown: boolean;
  note: string | null;
};

type FlowRow = {
  flowId: string;
  date: string;
  amount: number;
  kind: 'internal_transfer' | 'roth_conversion' | 'external';
  counterpartAccountId: string | null;
  counterpart:
    | { type: 'transaction'; accountId: string; sourceId: string; name: string; date: string; amount: number }
    | { type: 'flow'; accountId: string; flowId: string; date: string; amount: number; kind: string }
    | { type: 'account'; accountId: string; name: string }
    | null;
};

const KIND_LABEL: Record<FlowRow['kind'], string> = {
  internal_transfer: 'Internal transfer',
  roth_conversion: 'Roth conversion',
  external: 'External',
};

export function TwrCard({
  scope,
  live,
  demo,
  title = 'Time-weighted return',
  allowAllToggle = false,
  showFlowsFor,
  refreshNonce = 0,
  range,
}: {
  scope: string;
  live: boolean;
  demo?: { windows: TwrRow[]; flows?: FlowRow[]; series?: TwrChartPoint[]; twr?: TwrChartHeader | null; sp500Twr?: TwrChartHeader | null };
  title?: string;
  allowAllToggle?: boolean;
  showFlowsFor?: string;
  refreshNonce?: number;
  range: RangeKey;
}) {
  const palette = useFinancePalette();
  const router = useRouter();
  const [allAccounts, setAllAccounts] = useState(false);
  const activeScope = allowAllToggle && allAccounts ? 'total' : scope;

  const liveTwr = useQuery(api.finance.queries.twr, live ? { scope: activeScope, refreshNonce } : 'skip');
  const liveSeries = useQuery(
    api.finance.queries.series,
    live ? { scope: activeScope, range, refreshNonce } : 'skip',
  );
  const liveFlows = useQuery(
    api.finance.queries.flows,
    live && showFlowsFor ? { accountId: showFlowsFor, refreshNonce } : 'skip',
  );

  const windows = useMemo(
    () => (live ? (liveTwr?.windows ?? []) : (demo?.windows ?? [])),
    [demo?.windows, live, liveTwr?.windows],
  );
  const points = live ? (liveSeries?.points ?? []) : (demo?.series ?? []);
  const header = live ? (liveSeries?.twr ?? null) : (demo?.twr ?? null);
  const sp500Header = live ? (liveSeries?.sp500Twr ?? null) : (demo?.sp500Twr ?? null);
  const flows = live ? (liveFlows ?? []) : (demo?.flows ?? []);
  const incomplete = header
    ? windows.some((row) => row.window === header.window && (!row.reliable || !row.flowsFullyKnown))
    : false;
  const note = windows.find((row) => row.window === header?.window)?.note ?? null;

  if (!live && !demo) return null;
  if (live && (liveTwr === undefined || liveSeries === undefined)) return null;

  const openNote = () => {
    if (!note) return;
    Alert.alert('Return note', note);
  };

  const openFlow = (flow: FlowRow) => {
    const target =
      flow.counterpart?.type === 'transaction'
        ? flow.counterpart.accountId
        : flow.counterpart?.type === 'flow'
          ? flow.counterpart.accountId
          : flow.counterpart?.type === 'account'
            ? flow.counterpart.accountId
            : flow.counterpartAccountId;
    if (!target) return;
    router.push(`/finances/account/${encodeURIComponent(target)}`);
  };

  const subtitle = header?.startDate && header.asOf
    ? `${header.window ? `${TWR_WINDOW_LABELS[header.window as keyof typeof TWR_WINDOW_LABELS] ?? header.window} · ` : ''}${formatCoverageDate(header.startDate)} – ${formatCoverageDate(header.asOf)}`
    : points.length === 0
      ? 'Finance writes the daily path; the app only displays it.'
      : undefined;

  return (
    <Card>
      <SectionHeader title={title} subtitle={subtitle} />
      {allowAllToggle ? (
        <View style={styles.toggle}>
          <TogglePill
            label="All accounts"
            value={allAccounts}
            onChange={setAllAccounts}
            color={palette.accent}
          />
        </View>
      ) : null}
      {points.length >= 2 ? (
        <>
          <TwrHeader twr={header} sp500Twr={sp500Header} />
          <TwrChart points={points} />
        </>
      ) : (
        <FText variant="callout" tone="muted" style={styles.empty}>
          No return path for this range yet.
        </FText>
      )}
      {incomplete ? (
        <Pressable onPress={openNote} disabled={!note} accessibilityRole="button">
          <Badge label="Estimated / incomplete flows" tone="accent" />
          {note ? (
            <FText variant="caption" tone="subtle" style={styles.noteHint}>
              {note}
            </FText>
          ) : null}
        </Pressable>
      ) : null}
      {showFlowsFor && flows.length > 0 ? (
        <View style={styles.flows}>
          <FText variant="eyebrow" tone="muted">
            Flows
          </FText>
          {flows.map((flow) => (
            <Pressable
              key={flow.flowId}
              onPress={() => openFlow(flow)}
              style={[styles.flow, { borderColor: palette.hairline }]}
              accessibilityRole="button"
              accessibilityLabel={`${KIND_LABEL[flow.kind]} ${formatUsdSigned(flow.amount)}`}
            >
              <View style={styles.flowTop}>
                <FText variant="callout" style={TABULAR} tone={flow.amount >= 0 ? 'positive' : 'negative'}>
                  {formatUsdSigned(flow.amount)}
                </FText>
                <FText variant="caption" tone="muted">
                  {formatCoverageDate(flow.date)}
                </FText>
              </View>
              <FText variant="caption" tone="subtle">
                {KIND_LABEL[flow.kind]}
                {flow.kind === 'internal_transfer' ? " · doesn't change net worth" : ''}
                {flow.counterpart?.type === 'transaction' ? ` · ${flow.counterpart.name}` : ''}
                {flow.counterpart?.type === 'account' ? ` · ${flow.counterpart.name}` : ''}
              </FText>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  toggle: { marginBottom: 10, alignItems: 'flex-start' },
  empty: { paddingVertical: 20, textAlign: 'center' },
  noteHint: { marginTop: 6 },
  flows: { marginTop: 14, gap: 8 },
  flow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 2 },
  flowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
});
