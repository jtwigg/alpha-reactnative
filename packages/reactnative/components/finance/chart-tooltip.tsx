import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { TABULAR, useFinancePalette } from '@/components/finance/ui';
import { classLabel, formatCoverageDate, formatPct, formatUsd } from '@/lib/finance-coverage';

export type TooltipRow = {
  /** Series key, for legend highlight / hide. */
  key?: string;
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
  highlightKey = null,
}: {
  date: string;
  rows: TooltipRow[];
  style?: StyleProp<ViewStyle>;
  /** Emphasizes the matching row and fades the rest. */
  highlightKey?: string | null;
}) {
  const palette = useFinancePalette();
  return (
    <View
      pointerEvents="none"
      accessibilityLabel={`Values on ${date}`}
      style={[
        styles.card,
        { backgroundColor: palette.tooltip, borderColor: palette.border, shadowColor: palette.tooltipShadow },
        style,
      ]}>
      <Text style={[styles.date, { color: palette.muted }]}>{formatCoverageDate(date)}</Text>
      {rows.map((row) => {
        const focused = highlightKey != null && row.key === highlightKey;
        const faded = highlightKey != null && row.key != null && !focused;
        return (
        <View
          key={row.key ?? row.label}
          style={[styles.row, focused && [styles.rowFocused, { backgroundColor: palette.chip }], faded && styles.rowFaded]}>
          {row.color ? <View style={[styles.dot, { backgroundColor: row.color }]} /> : null}
          <Text style={[styles.label, { color: palette.muted }]} numberOfLines={1}>
            {row.label}
          </Text>
          <Text
            style={[styles.value, { color: palette.text }, (row.emphasis || focused) && styles.emphasis]}
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
        );
      })}
    </View>
  );
}

export function moneyAndPct(value: number, start: number): Pick<TooltipRow, 'value' | 'detail'> {
  const pct = start === 0 ? null : value / start - 1;
  return { value: formatUsd(value), detail: formatPct(pct) };
}

export function classRows(byClass: Record<string, number>, colorFor: (className: string) => string): TooltipRow[] {
  return Object.entries(byClass)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([className, amount]) => ({
      key: className,
      label: classLabel(className),
      value: formatUsd(amount),
      color: colorFor(className),
    }));
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
    minWidth: 190,
    maxWidth: 280,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 6,
  },
  date: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowFocused: { marginHorizontal: -6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  rowFaded: { opacity: 0.45 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { flex: 1, fontSize: 12 },
  value: { fontSize: 13, fontWeight: '600', ...TABULAR },
  emphasis: { fontWeight: '700' },
  detail: { fontSize: 12, fontWeight: '600', minWidth: 52, textAlign: 'right', ...TABULAR },
});
