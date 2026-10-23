import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { classColor, classLabel, formatCoverageDate, formatPct, formatUsd } from '@/lib/finance-coverage';

export function ChartTooltip({
  date,
  rows,
}: {
  date: string;
  rows: Array<{ label: string; value: string; color?: string; emphasis?: boolean }>;
}) {
  return (
    <View style={styles.card} accessibilityLabel={`Values on ${date}`}>
      <ThemedText type="defaultSemiBold">{formatCoverageDate(date)}</ThemedText>
      {rows.map((row) => (
        <View key={row.label} style={styles.row}>
          {row.color ? <View style={[styles.dot, { backgroundColor: row.color }]} /> : null}
          <ThemedText style={[styles.label, row.emphasis && styles.emphasis]}>{row.label}</ThemedText>
          <ThemedText style={[styles.value, row.emphasis && styles.emphasis]}>{row.value}</ThemedText>
        </View>
      ))}
    </View>
  );
}

export function moneyAndPct(value: number, start: number): string {
  const pct = start === 0 ? null : value / start - 1;
  return `${formatUsd(value)} (${formatPct(pct)})`;
}

export function classRows(byClass: Record<string, number>) {
  return Object.entries(byClass)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([className, amount]) => ({
      label: classLabel(className),
      value: formatUsd(amount),
      color: classColor(className),
    }));
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#d0d7de',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
    minWidth: 200,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { flex: 1, fontSize: 12, opacity: 0.75 },
  value: { fontSize: 12, fontWeight: '600' },
  emphasis: { opacity: 1, fontWeight: '700' },
});
