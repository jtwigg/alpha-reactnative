import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { classColor, classLabel, formatUsd } from '@/lib/finance-coverage';

export function Breakdown({
  assets,
  liabilities,
  byClass,
}: {
  assets: number;
  liabilities: number;
  byClass: Record<string, number>;
}) {
  const rows = Object.entries(byClass).sort(([a], [b]) => a.localeCompare(b));
  return (
    <View style={styles.card}>
      <ThemedText type="defaultSemiBold">Allocation</ThemedText>
      <View style={styles.split}>
        <View style={styles.stat}>
          <ThemedText style={styles.muted}>Assets</ThemedText>
          <ThemedText type="defaultSemiBold">{formatUsd(assets)}</ThemedText>
        </View>
        <View style={styles.stat}>
          <ThemedText style={styles.muted}>Liabilities</ThemedText>
          <ThemedText type="defaultSemiBold">{formatUsd(liabilities)}</ThemedText>
        </View>
      </View>
      {rows.map(([className, amount]) => (
        <View key={className} style={styles.row}>
          <View style={styles.left}>
            <View style={[styles.dot, { backgroundColor: classColor(className) }]} />
            <ThemedText>{classLabel(className)}</ThemedText>
          </View>
          <ThemedText type="defaultSemiBold">{formatUsd(amount)}</ThemedText>
        </View>
      ))}
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
  },
  split: { flexDirection: 'row', gap: 16 },
  stat: { flex: 1, gap: 2 },
  muted: { opacity: 0.65, fontSize: 13 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
