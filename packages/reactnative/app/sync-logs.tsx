import { useQuery } from 'convex/react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Badge, Card, Divider, FText, StateMessage } from '@/components/finance/ui';
import { api } from '@/lib/api';
import { MAX_CONTENT_WIDTH, useAppPalette } from '@/lib/app-theme';
import { formatPacific } from '@/lib/app-version';
import {
  abortLabel,
  itemLines,
  runHeadline,
  runStatusLabel,
  type SyncLogs,
  type SyncRunRow,
} from '@/lib/plaid-status';

function statusTone(status: SyncRunRow['status']): 'muted' | 'warning' {
  return status === 'ok' ? 'muted' : 'warning';
}

export default function SyncLogsScreen() {
  const palette = useAppPalette();
  const logs = useQuery(api.plaid.store.syncLogs, {}) as SyncLogs | undefined;

  if (logs === undefined) {
    return <StateMessage title="Loading sync logs…" />;
  }

  return (
    <ScrollView
      style={{ backgroundColor: palette.page }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic">
      <View style={styles.column}>
        <FText variant="eyebrow" tone="muted">
          Sync logs
        </FText>
        <FText variant="callout" tone="muted">
          {logs.syncEnabled
            ? 'Sync is on. It runs once a day at 11:30 UTC.'
            : 'Sync is off. Nothing will run until it is switched on.'}
        </FText>

        {logs.runs.length === 0 ? (
          <StateMessage title="No syncs yet" body="The first run appears here once sync has run." />
        ) : (
          logs.runs.map((run) => {
            const lines = itemLines(run.report);
            const stopped = abortLabel(run.abortReason);
            return (
              <Card key={run.id}>
                <View style={styles.head}>
                  <View style={styles.headText}>
                    <FText variant="headline">{formatPacific(new Date(run.startedAt))}</FText>
                    <FText variant="caption" tone="muted">
                      {runHeadline(run)}
                    </FText>
                  </View>
                  <Badge label={runStatusLabel(run.status)} tone={statusTone(run.status)} />
                </View>
                {stopped ? (
                  <FText variant="callout" tone="negative" style={styles.pad}>
                    {stopped}
                  </FText>
                ) : null}
                {lines.length > 0 ? <Divider /> : null}
                {lines.map((line, index) => (
                  <View key={`${run.id}-${index}`} style={styles.line}>
                    <FText variant="callout">{line.institution}</FText>
                    <FText
                      variant="caption"
                      tone={line.tone === 'ok' ? 'muted' : line.tone === 'warn' ? 'accent' : 'negative'}>
                      {line.tone === 'ok' ? '✓ ' : line.tone === 'warn' ? '⚠ ' : '✕ '}
                      {line.text}
                    </FText>
                  </View>
                ))}
              </Card>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, alignItems: 'center' },
  column: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  headText: { flex: 1, gap: 2 },
  pad: { paddingHorizontal: 14, paddingBottom: 8 },
  line: { paddingHorizontal: 14, paddingVertical: 8, gap: 2 },
});
