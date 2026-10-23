import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FINANCE_COVERAGE, formatCoverageDate } from '@/lib/finance-coverage';

export function CoverageLegend() {
  return (
    <View style={styles.card}>
      <ThemedText type="defaultSemiBold">History coverage</ThemedText>
      <ThemedText style={styles.lead}>
        Accounts are left out of totals until their first stored point — they
        are never drawn as $0. Gaps after that are bridged with a lighter dashed
        interpolated line. Manual rows (home, mortgage) can extend history
        further back than a provider feed.
      </ThemedText>

      <View style={styles.timeline} accessibilityLabel="Coverage timeline">
        <View style={[styles.band, styles.bandHome]} />
        <View style={[styles.band, styles.bandCash]} />
        <View style={[styles.band, styles.bandInvest]} />
        <View style={[styles.band, styles.bandLate]} />
      </View>
      <View style={styles.axis}>
        <ThemedText style={styles.tick}>Manual home</ThemedText>
        <ThemedText style={styles.tick}>Oct 2025 cash</ThemedText>
        <ThemedText style={styles.tick}>Jul 31 2026</ThemedText>
        <ThemedText style={styles.tick}>Oct 12 2026</ThemedText>
      </View>

      <View style={styles.rows}>
        <CoverageRow
          title="Home & loans"
          detail="Manual snapshots. History can start years before Plaid."
        />
        <CoverageRow
          title="Cash & credit"
          detail={`Provider coverage from ${formatCoverageDate(FINANCE_COVERAGE.cash.start)}.`}
        />
        <CoverageRow
          title="Investments"
          detail={`Most accounts ${formatCoverageDate(FINANCE_COVERAGE.investments.start)}; some ${formatCoverageDate(FINANCE_COVERAGE.investments.lateStart)}.`}
        />
      </View>
    </View>
  );
}

function CoverageRow({ title, detail }: { title: string; detail: string }) {
  return (
    <View style={styles.row}>
      <ThemedText type="defaultSemiBold">{title}</ThemedText>
      <ThemedText style={styles.detail}>{detail}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#d0d7de',
    borderRadius: 16,
    padding: 16,
    gap: 10,
    backgroundColor: '#f6f8fa',
  },
  lead: { opacity: 0.8, fontSize: 14, lineHeight: 20 },
  timeline: {
    flexDirection: 'row',
    height: 14,
    borderRadius: 8,
    overflow: 'hidden',
    marginTop: 4,
  },
  band: { flex: 1 },
  bandHome: { flex: 2.4, backgroundColor: '#d8c7f0' },
  bandCash: { flex: 1.4, backgroundColor: '#c6e6d0' },
  bandInvest: { flex: 0.8, backgroundColor: '#9ec5e8' },
  bandLate: { flex: 0.35, backgroundColor: '#0a7ea4' },
  axis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  tick: { fontSize: 11, opacity: 0.7, flex: 1 },
  rows: { gap: 10, marginTop: 4 },
  row: { gap: 2 },
  detail: { fontSize: 13, opacity: 0.75, lineHeight: 18 },
});
