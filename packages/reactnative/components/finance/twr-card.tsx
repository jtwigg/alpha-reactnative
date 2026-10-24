import { useQuery } from 'convex/react';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import {
  Badge,
  Card,
  FText,
  SectionHeader,
  Segmented,
  TABULAR,
  TogglePill,
  useFinancePalette,
} from '@/components/finance/ui';
import { api } from '@/lib/api';
import { formatCoverageDate, formatPct, formatUsdSigned } from '@/lib/finance-coverage';
import { TWR_WINDOW_LABELS, TWR_WINDOWS, type TwrWindow } from '../../../server/convex/finance/twrModel';

type TwrRow = {
  window: TwrWindow;
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

const WINDOW_LABELS: Record<TwrWindow, string> = {
  '3M': '3M',
  '6M': '6M',
  YTD: 'YTD',
  '1Y': '1Y',
  '3Y': '3Y',
  SI: 'SI',
};

export function TwrCard({
  scope,
  live,
  demo,
  title = 'Time-weighted return',
  allowAllToggle = false,
  showFlowsFor,
  refreshNonce = 0,
}: {
  scope: string;
  live: boolean;
  demo?: { windows: TwrRow[]; flows?: FlowRow[] };
  title?: string;
  allowAllToggle?: boolean;
  showFlowsFor?: string;
  refreshNonce?: number;
}) {
  const palette = useFinancePalette();
  const router = useRouter();
  const [allAccounts, setAllAccounts] = useState(false);
  const [window, setWindow] = useState<TwrWindow>('1Y');
  const activeScope = allowAllToggle && allAccounts ? 'total' : scope;

  const liveTwr = useQuery(api.finance.queries.twr, live ? { scope: activeScope, refreshNonce } : 'skip');
  const liveFlows = useQuery(
    api.finance.queries.flows,
    live && showFlowsFor ? { accountId: showFlowsFor, refreshNonce } : 'skip',
  );

  const windows = useMemo(
    () => (live ? (liveTwr?.windows ?? []) : (demo?.windows ?? [])),
    [demo?.windows, live, liveTwr?.windows],
  );
  const flows = live ? (liveFlows ?? []) : (demo?.flows ?? []);
  const row = useMemo(
    () => windows.find((item) => item.window === window) ?? windows[0] ?? null,
    [window, windows],
  );
  const available = useMemo(
    () => TWR_WINDOWS.filter((key) => windows.some((item) => item.window === key)),
    [windows],
  );
  const selected = row?.window ?? window;
  const incomplete = row ? !row.reliable || !row.flowsFullyKnown : false;

  if (!live && !demo) return null;
  if (live && liveTwr === undefined) return null;
  if (windows.length === 0 && flows.length === 0) return null;

  const openNote = () => {
    if (!row?.note) return;
    Alert.alert('Return note', row.note);
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

  return (
    <Card>
      <SectionHeader
        title={title}
        subtitle={
          row
            ? `${TWR_WINDOW_LABELS[row.window]} · ${formatCoverageDate(row.startDate)} – ${formatCoverageDate(row.asOf)}`
            : 'Finance writes these figures; the app only displays them.'
        }
      />
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
      {available.length > 0 ? (
        <Segmented
          options={available}
          value={available.includes(selected) ? selected : available[0]}
          onChange={setWindow}
          labels={WINDOW_LABELS}
          stretch
          accessibilityLabel="Return window"
        />
      ) : null}
      {row ? (
        <View style={styles.stats}>
          <View style={styles.stat}>
            <FText variant="caption" tone="muted">
              Cumulative
            </FText>
            <FText variant="title" style={TABULAR} tone={row.cumulative >= 0 ? 'positive' : 'negative'}>
              {formatPct(row.cumulative)}
            </FText>
          </View>
          <View style={styles.stat}>
            <FText variant="caption" tone="muted">
              Annualized
            </FText>
            <FText variant="title" style={TABULAR} tone={(row.annualized ?? 0) >= 0 ? 'positive' : 'negative'}>
              {formatPct(row.annualized)}
            </FText>
          </View>
        </View>
      ) : (
        <FText variant="caption" tone="muted">
          No return for this window yet.
        </FText>
      )}
      {incomplete ? (
        <Pressable onPress={openNote} disabled={!row?.note} accessibilityRole="button">
          <Badge label="Estimated / incomplete flows" tone="accent" />
          {row?.note ? (
            <FText variant="caption" tone="subtle" style={styles.noteHint}>
              {row.note}
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
  stats: { flexDirection: 'row', gap: 24, marginTop: 14, marginBottom: 8 },
  stat: { flex: 1, gap: 2 },
  noteHint: { marginTop: 6 },
  flows: { marginTop: 14, gap: 8 },
  flow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 2 },
  flowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
});
