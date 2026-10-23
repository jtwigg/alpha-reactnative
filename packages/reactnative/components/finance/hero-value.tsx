import { StyleSheet, Text, View } from 'react-native';

import { FText, TABULAR, useFinancePalette } from '@/components/finance/ui';
import { useAnimatedNumber } from '@/hooks/use-animated-number';
import { formatCoverageDate, formatPct, formatUsd, formatUsdSigned } from '@/lib/finance-coverage';

type Point = { asOf: string; total: number };

export type HeroTone = 'positive' | 'negative' | 'muted';

/** Range tone; `invert` for balances where going down is good (loans). */
export function changeTone(change: number, invert = false): HeroTone {
  if (Math.abs(change) < 0.5) return 'muted';
  return (change > 0) !== invert ? 'positive' : 'negative';
}

/**
 * Large value plus the change since the start of the range. While scrubbing
 * it follows the crosshair and eases between values.
 */
export function HeroValue({
  label,
  points,
  scrubIndex,
  fallback,
  suffix,
  invert = false,
}: {
  label?: string;
  points: Point[];
  scrubIndex: number | null;
  /** Shown when there is no chart history. */
  fallback: number;
  suffix: string;
  invert?: boolean;
}) {
  const palette = useFinancePalette();
  const index = scrubIndex != null && points[scrubIndex] ? scrubIndex : points.length - 1;
  const point = points[index];
  const first = points[0]?.total;
  const value = useAnimatedNumber(point?.total ?? fallback);
  const change = first != null ? value - first : 0;
  const pct = first != null && Math.abs(first) >= 0.005 ? change / Math.abs(first) : null;
  const tone = changeTone(change, invert);
  const arrow = tone === 'muted' ? '' : change > 0 ? '▲ ' : '▼ ';
  const scrubbing = scrubIndex != null && point != null;

  return (
    <View style={styles.wrap} accessibilityLabel={`${label ?? 'Value'} ${formatUsd(value)}`}>
      {label ? (
        <FText variant="eyebrow" tone="muted">
          {label}
        </FText>
      ) : null}
      <FText variant="display" style={styles.value} numberOfLines={1}>
        {formatUsd(value)}
      </FText>
      {points.length > 1 ? (
        <View style={styles.changeRow}>
          <Text style={[styles.change, { color: palette[tone] }]} numberOfLines={1}>
            {arrow}
            {formatUsdSigned(Math.round(change))} ({formatPct(pct)})
          </Text>
          <Text style={[styles.suffix, { color: scrubbing ? palette.text : palette.muted }]} numberOfLines={1}>
            {scrubbing ? formatCoverageDate(point.asOf) : suffix}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 2 },
  value: { marginTop: 2, ...TABULAR },
  changeRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  change: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2, ...TABULAR },
  suffix: { fontSize: 15, fontWeight: '500', ...TABULAR },
});
