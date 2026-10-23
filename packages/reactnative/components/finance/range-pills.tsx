import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { RangeKey } from '../../../server/convex/finance/series';

const RANGES: RangeKey[] = ['1M', '3M', 'YTD', '1Y', 'All'];

export function RangePills({
  value,
  onChange,
}: {
  value: RangeKey;
  onChange: (range: RangeKey) => void;
}) {
  return (
    <View style={styles.row}>
      {RANGES.map((range) => {
        const active = range === value;
        return (
          <Pressable
            key={range}
            onPress={() => onChange(range)}
            style={[styles.pill, active && styles.active]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}>
            <ThemedText style={[styles.label, active && styles.activeLabel]}>{range}</ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#d0d7de',
    backgroundColor: '#fff',
  },
  active: { backgroundColor: '#0a7ea4', borderColor: '#0a7ea4' },
  label: { fontSize: 13, fontWeight: '600', color: '#11181C' },
  activeLabel: { color: '#fff' },
});
