import { useQuery } from 'convex/react';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountTable } from '@/components/finance/account-table';
import { Breakdown } from '@/components/finance/breakdown';
import { ClassChart } from '@/components/finance/class-chart';
import { CoverageLegend } from '@/components/finance/coverage-legend';
import { NetWorthChart } from '@/components/finance/net-worth-chart';
import { RangePills } from '@/components/finance/range-pills';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { api } from '@/lib/api';
import { isClerkConfigured } from '@/lib/convex';
import { formatPct, formatUsd, formatUsdSigned } from '@/lib/finance-coverage';
import { isFinanceDemoFlag, useFinanceDemo } from '@/lib/finance-demo';
import { demoNetWorthPage } from '@/lib/finance-fixtures';
import type { RangeKey } from '../../../server/convex/finance/series';

export default function FinancesScreen() {
  const demo = useFinanceDemo();
  if (!isClerkConfigured() && !demo && !isFinanceDemoFlag()) {
    return null;
  }
  return <NetWorthPage demo={demo} />;
}

function NetWorthPage({ demo }: { demo: boolean }) {
  const [range, setRange] = useState<RangeKey>('All');
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const allowed = useQuery(
    api.finance.queries.isAllowed,
    demo && !isClerkConfigured() ? 'skip' : undefined,
  );
  const live = useQuery(
    api.finance.queries.page,
    allowed ? { range, refreshNonce } : 'skip',
  );
  const [held, setHeld] = useState(live);

  useEffect(() => {
    if (live) setHeld(live);
  }, [live]);

  useEffect(() => {
    if (refreshing && live !== undefined) {
      setRefreshing(false);
    }
  }, [live, refreshNonce, refreshing]);

  const data = useMemo(() => {
    const source = live ?? held;
    if (allowed && source && source.accounts.length > 0) return source;
    if (demo) return demoNetWorthPage(range);
    return source;
  }, [allowed, demo, held, live, range]);

  const onRefresh = () => {
    setRefreshing(true);
    setRefreshNonce((nonce) => nonce + 1);
    if (demo && !allowed) {
      setRefreshing(false);
    }
  };

  if (!demo && allowed === undefined && !held) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  if (!demo && allowed === false) {
    return (
      <ThemedView style={styles.flex}>
        <SafeAreaView style={styles.flex} edges={['top']}>
          <View style={styles.header}>
            <ThemedText type="title">Personal finances</ThemedText>
            <ThemedText style={styles.muted}>This section is not available for this account.</ThemedText>
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (!data) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  const usingDemo = demo && !(allowed && (live ?? held) && (live ?? held)!.accounts.length > 0);
  const positive = data.change >= 0;

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }>
          <ThemedText type="title">Net worth</ThemedText>
          {usingDemo ? (
            <View style={styles.demoBanner}>
              <ThemedText style={styles.demoText}>
                Fixture data for layout only — invented accounts, not real balances.
              </ThemedText>
            </View>
          ) : null}

          <ThemedText style={styles.headline}>{formatUsd(data.headline)}</ThemedText>
          <ThemedText style={[styles.delta, { color: positive ? '#1a7f37' : '#cf222e' }]}>
            {formatUsdSigned(data.change)} ({formatPct(data.changePct)}) · {range}
          </ThemedText>
          <ThemedText style={styles.muted}>
            Continuous totals. An account is omitted until its first point, so
            coverage changes are marked instead of a $0 step. Display-only —
            Finance writes every row.
          </ThemedText>

          <RangePills value={range} onChange={setRange} />
          <NetWorthChart points={data.points} markers={data.coverageMarkers} />
          <ClassChart points={data.points} />
          <CoverageLegend />
          <Breakdown assets={data.assets} liabilities={data.liabilities} byClass={data.byClass} />

          <ThemedText type="subtitle" style={styles.section}>
            Accounts
          </ThemedText>
          <AccountTable accounts={data.accounts} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, gap: 14, paddingBottom: 56 },
  header: { padding: 20, gap: 8 },
  headline: { fontSize: 36, fontWeight: '700', letterSpacing: -0.6 },
  delta: { fontSize: 16, fontWeight: '600' },
  muted: { opacity: 0.7, lineHeight: 20 },
  section: { marginTop: 8 },
  demoBanner: {
    backgroundColor: '#fff8c5',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  demoText: { color: '#7d4e00', fontSize: 13, fontWeight: '600' },
});
