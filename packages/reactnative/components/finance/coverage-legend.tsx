import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, FText, useFinancePalette } from '@/components/finance/ui';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useChartColors } from '@/lib/finance-colors';
import { FINANCE_COVERAGE, formatCoverageDate } from '@/lib/finance-coverage';

export function CoverageLegend() {
  const palette = useFinancePalette();
  const colors = useChartColors();
  const [open, setOpen] = useState(false);
  return (
    <Card padded={false}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={styles.header}>
        <View style={styles.flex}>
          <FText variant="headline">About history coverage</FText>
          <FText variant="caption" tone="muted">
            Why some lines start late or show dashed segments.
          </FText>
        </View>
        <IconSymbol
          name="chevron.right"
          size={18}
          color={palette.subtle}
          style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}
        />
      </Pressable>
      {open ? (
        <View style={styles.body}>
          <FText variant="callout" tone="muted">
            Accounts are left out of totals until their first stored point — never drawn as $0.
            Gaps after that are bridged with a dashed interpolated line. Manual rows (home,
            mortgage) can extend history further back than a provider feed.
          </FText>
          <CoverageRow
            color={colors.groups.real_estate}
            title="Home & loans"
            detail="Manual snapshots. History can start years before the provider feed."
          />
          <CoverageRow
            color={colors.groups.cash}
            title="Cash & credit"
            detail={`Provider coverage from ${formatCoverageDate(FINANCE_COVERAGE.cash.start)}.`}
          />
          <CoverageRow
            color={colors.groups.investments}
            title="Investments"
            detail={`Most accounts from ${formatCoverageDate(FINANCE_COVERAGE.investments.start)}; some from ${formatCoverageDate(FINANCE_COVERAGE.investments.lateStart)}.`}
          />
        </View>
      ) : null}
    </Card>
  );
}

function CoverageRow({ color, title, detail }: { color: string; title: string; detail: string }) {
  return (
    <View style={styles.row}>
      <View style={[styles.bar, { backgroundColor: color }]} />
      <View style={styles.flex}>
        <FText variant="callout" style={styles.title}>
          {title}
        </FText>
        <FText variant="caption" tone="muted">
          {detail}
        </FText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  body: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  flex: { flex: 1, gap: 2 },
  row: { flexDirection: 'row', gap: 10 },
  bar: { width: 3, borderRadius: 2 },
  title: { fontWeight: '600' },
});
