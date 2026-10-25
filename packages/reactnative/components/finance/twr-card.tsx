import { useQuery } from 'convex/react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Badge, Card, FText, SectionHeader, TABULAR, useFinancePalette } from '@/components/finance/ui';
import { api } from '@/lib/api';
import { formatCoverageDate, formatUsdSigned } from '@/lib/finance-coverage';

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

/** Flows list for an investment account. The TWR path lives on the balance chart. */
export function TwrCard({
  live,
  demo,
  showFlowsFor,
  refreshNonce = 0,
}: {
  live: boolean;
  demo?: { flows?: FlowRow[] };
  showFlowsFor?: string;
  refreshNonce?: number;
}) {
  const palette = useFinancePalette();
  const router = useRouter();
  const liveTwr = useQuery(
    api.finance.queries.twr,
    live && showFlowsFor ? { scope: `account:${showFlowsFor}`, refreshNonce } : 'skip',
  );
  const liveFlows = useQuery(
    api.finance.queries.flows,
    live && showFlowsFor ? { accountId: showFlowsFor, refreshNonce } : 'skip',
  );
  const flows = live ? (liveFlows ?? []) : (demo?.flows ?? []);
  const windows = live ? (liveTwr?.windows ?? []) : [];
  const incomplete = windows.some((row) => !row.reliable || !row.flowsFullyKnown);
  const note = windows.find((row) => row.note)?.note ?? null;

  if (!live && !demo) return null;
  if (live && (liveTwr === undefined || liveFlows === undefined)) return null;
  if (flows.length === 0 && !incomplete) return null;

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

  return (
    <Card>
      <SectionHeader title="Flows" subtitle="Cash that affects this account’s time-weighted return." />
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
    </Card>
  );
}

const styles = StyleSheet.create({
  noteHint: { marginTop: 6 },
  flow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 2 },
  flowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
});
