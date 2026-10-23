import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { TABULAR, useFinancePalette } from '@/components/finance/ui';
import { classColor, classLabel, formatCoverageDate, formatPct, formatUsd } from '@/lib/finance-coverage';

export type TooltipRow = {
  label: string;
  value: string;
  detail?: string;
  color?: string;
  emphasis?: boolean;
};

export function ChartTooltip({
  date,
  rows,
  style,
}: {
  date: string;
  rows: TooltipRow[];
  style?: StyleProp<ViewStyle>;
}) {
  const palette = useFinancePalette();
  return (
    <View
      pointerEvents="none"
      accessibilityLabel={`Values on ${date}`}
      style={[
        styles.card,
        { backgroundColor: palette.tooltip, borderColor: palette.border, shadowColor: palette.shadow },
        style,
      ]}>
      <Text style={[styles.date, { color: palette.muted }]}>{formatCoverageDate(date)}</Text>
      {rows.map((row) => (
        <View key={row.label} style={styles.row}>
          {row.color ? <View style={[styles.dot, { backgroundColor: row.color }]} /> : null}
          <Text style={[styles.label, { color: palette.muted }]} numberOfLines={1}>
            {row.label}
          </Text>
          <Text
            style={[styles.value, { color: palette.text }, row.emphasis && styles.emphasis]}
            numberOfLines={1}>
            {row.value}
          </Text>
          {row.detail ? (
            <Text
              style={[
                styles.detail,
                {
                  color: row.detail.startsWith('+')
                    ? palette.positive
                    : row.detail.startsWith('−')
                      ? palette.negative
                      : palette.muted,
                },
              ]}>
              {row.detail}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

export function moneyAndPct(value: number, start: number): Pick<TooltipRow, 'value' | 'detail'> {
  const pct = start === 0 ? null : value / start - 1;
  return { value: formatUsd(value), detail: formatPct(pct) };
}

export function classRows(byClass: Record<string, number>): TooltipRow[] {
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
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 5,
    minWidth: 190,
    maxWidth: 280,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 4,
  },
  date: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { flex: 1, fontSize: 12 },
  value: { fontSize: 13, fontWeight: '600', ...TABULAR },
  emphasis: { fontWeight: '700' },
  detail: { fontSize: 12, fontWeight: '600', minWidth: 52, textAlign: 'right', ...TABULAR },
});
