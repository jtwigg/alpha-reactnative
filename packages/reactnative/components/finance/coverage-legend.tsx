import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FINANCE_COVERAGE, formatCoverageDate } from '@/lib/finance-coverage';

export function CoverageLegend() {
  return (
    <View style={styles.card}>
      <ThemedText type="defaultSemiBold">History coverage</ThemedText>
      <ThemedText style={styles.lead}>
        Investment coverage begins {formatCoverageDate(FINANCE_COVERAGE.investments.start)}{' '}
        and {formatCoverageDate(FINANCE_COVERAGE.investments.lateStart)} for some accounts.
        Those balances were held flat before coverage — that stretch is not a gain.
      </ThemedText>

      <View style={styles.timeline} accessibilityLabel="Coverage timeline">
        <View style={[styles.band, styles.bandPartial]} />
        <View style={[styles.band, styles.bandMixed]} />
        <View style={[styles.band, styles.bandFull]} />
      </View>
      <View style={styles.axis}>
        <ThemedText style={styles.tick}>Oct 2025 cash</ThemedText>
        <ThemedText style={styles.tick}>Jul 31 2026</ThemedText>
        <ThemedText style={styles.tick}>Oct 12 2026</ThemedText>
      </View>

      <View style={styles.swatches}>
        <Swatch color="#d0d7de" label="Held flat / partial data" />
        <Swatch color="#9ec5e8" label="Investments (some accounts)" />
        <Swatch color="#0a7ea4" label="Covered history" />
      </View>

      <View style={styles.rows}>
        <CoverageRow
          title="Cash & credit"
          detail={`Starts ${formatCoverageDate(FINANCE_COVERAGE.cash.start)}. ${FINANCE_COVERAGE.cash.note}`}
        />
        <CoverageRow
          title="Investments"
          detail={FINANCE_COVERAGE.investments.note}
        />
        <CoverageRow title="Real estate" detail={FINANCE_COVERAGE.real_estate.note} />
      </View>
    </View>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.swatch}>
      <View style={[styles.swatchChip, { backgroundColor: color }]} />
      <ThemedText style={styles.swatchLabel}>{label}</ThemedText>
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
  bandPartial: { flex: 3, backgroundColor: '#d0d7de' },
  bandMixed: { flex: 1, backgroundColor: '#9ec5e8' },
  bandFull: { flex: 1.2, backgroundColor: '#0a7ea4' },
  axis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  tick: { fontSize: 11, opacity: 0.7, flex: 1 },
  swatches: { gap: 6, marginTop: 4 },
  swatch: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatchChip: { width: 12, height: 12, borderRadius: 3 },
  swatchLabel: { fontSize: 13, opacity: 0.8 },
  rows: { gap: 10, marginTop: 4 },
  row: { gap: 2 },
  detail: { fontSize: 13, opacity: 0.75, lineHeight: 18 },
});
