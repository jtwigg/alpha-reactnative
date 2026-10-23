import { useQuery } from 'convex/react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CoverageLegend } from '@/components/finance/coverage-legend';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { api } from '@/lib/api';
import { isClerkConfigured } from '@/lib/convex';
import {
  coverageForClass,
  formatCoverageDate,
  formatUsd,
  isBeforeCoverage,
} from '@/lib/finance-coverage';

export default function FinancesScreen() {
  if (!isClerkConfigured()) {
    return null;
  }
  return <NetWorthPage />;
}

function NetWorthPage() {
  const allowed = useQuery(api.finance.queries.isAllowed);
  const netWorth = useQuery(api.finance.queries.netWorth, allowed ? {} : 'skip');

  if (allowed === undefined) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  if (!allowed) {
    return (
      <ThemedView style={styles.flex}>
        <SafeAreaView style={styles.flex} edges={['top']}>
          <View style={styles.header}>
            <ThemedText type="title">Finances</ThemedText>
            <ThemedText style={styles.muted}>This section is not available for this account.</ThemedText>
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (netWorth === undefined) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  const classes = Object.entries(netWorth.byClass).sort(([a], [b]) => a.localeCompare(b));

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <ThemedText type="title">Net worth</ThemedText>
          <ThemedText style={styles.headline}>{formatUsd(netWorth.total)}</ThemedText>
          <ThemedText style={styles.muted}>
            Signed total by class (credit / liability as negative). History is only as
            complete as the coverage bands below.
          </ThemedText>

          <CoverageLegend />

          <ThemedText type="subtitle" style={styles.section}>
            By class
          </ThemedText>
          {classes.length === 0 ? (
            <ThemedText style={styles.muted}>No accounts ingested yet.</ThemedText>
          ) : (
            classes.map(([className, amount]) => {
              const coverage = coverageForClass(className);
              return (
                <View key={className} style={styles.classRow}>
                  <View style={styles.classText}>
                    <ThemedText type="defaultSemiBold">{coverage.label}</ThemedText>
                    {coverage.start ? (
                      <ThemedText style={styles.small}>
                        Coverage from {formatCoverageDate(coverage.start)}
                        {'lateStart' in coverage && coverage.lateStart
                          ? ` (some accounts ${formatCoverageDate(coverage.lateStart)})`
                          : ''}
                      </ThemedText>
                    ) : (
                      <ThemedText style={styles.small}>{coverage.note}</ThemedText>
                    )}
                  </View>
                  <ThemedText type="defaultSemiBold">{formatUsd(amount)}</ThemedText>
                </View>
              );
            })
          )}

          <ThemedText type="subtitle" style={styles.section}>
            Accounts
          </ThemedText>
          {netWorth.accounts.length === 0 ? (
            <ThemedText style={styles.muted}>
              Ingest accounts with `npx convex run finance/ingest:upsertAccounts`.
            </ThemedText>
          ) : (
            netWorth.accounts.map((account) => {
              const snap = account.latestSnapshot;
              const asOf = snap?.asOf;
              const partial =
                isBeforeCoverage(asOf, account.class, account.coverageStart) ||
                (account.class === 'investments' &&
                  !!asOf &&
                  asOf < '2026-10-12' &&
                  (account.coverageStart === '2026-10-12' || !account.coverageStart));
              return (
                <View key={account.sourceId} style={styles.account}>
                  <View style={styles.accountTop}>
                    <ThemedText type="defaultSemiBold">{account.name}</ThemedText>
                    <ThemedText>{formatUsd(snap?.balance ?? account.currentBalance)}</ThemedText>
                  </View>
                  <ThemedText style={styles.small}>
                    {coverageForClass(account.class).label}
                    {asOf ? ` · as of ${formatCoverageDate(asOf)}` : ' · current balance only'}
                    {snap?.source ? ` · ${snap.source}` : ''}
                  </ThemedText>
                  {partial ? (
                    <View style={styles.badge}>
                      <ThemedText style={styles.badgeText}>Partial data</ThemedText>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, gap: 12, paddingBottom: 48 },
  header: { padding: 20, gap: 8 },
  headline: { fontSize: 36, fontWeight: '700', letterSpacing: -0.5 },
  muted: { opacity: 0.7, lineHeight: 20 },
  section: { marginTop: 12 },
  classRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#d0d7de',
  },
  classText: { flex: 1, gap: 2 },
  small: { fontSize: 13, opacity: 0.7 },
  account: {
    borderWidth: 1,
    borderColor: '#d0d7de',
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  accountTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff8c5',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 4,
  },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#7d4e00' },
});
