import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import {
  classLabel,
  formatCoverageDate,
  formatUsd,
} from '@/lib/finance-coverage';
import type { PageAccount } from '../../../server/convex/finance/series';

export function AccountTable({ accounts }: { accounts: PageAccount[] }) {
  if (accounts.length === 0) {
    return (
      <ThemedText style={styles.muted}>
        No accounts yet. The Finance agent writes them with `npx convex run
        finance/ingest:upsertAccounts`.
      </ThemedText>
    );
  }

  return (
    <View style={styles.list}>
      {accounts.map((account) => {
        const snap = account.latestSnapshot;
        return (
          <View key={account.sourceId} style={styles.row}>
            <View style={styles.top}>
              <ThemedText type="defaultSemiBold">{account.name}</ThemedText>
              <ThemedText type="defaultSemiBold">{formatUsd(account.signedBalance)}</ThemedText>
            </View>
            <ThemedText style={styles.meta}>
              {classLabel(account.class)}
              {account.isManual ? ' · manual' : ` · ${account.provider}`}
              {account.firstAsOf
                ? ` · from ${formatCoverageDate(account.firstAsOf)}`
                : ' · no history yet'}
              {snap ? ` · ${snap.source}` : ''}
            </ThemedText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  row: {
    borderWidth: 1,
    borderColor: '#d0d7de',
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  meta: { fontSize: 13, opacity: 0.7 },
  muted: { opacity: 0.7, lineHeight: 20 },
});
