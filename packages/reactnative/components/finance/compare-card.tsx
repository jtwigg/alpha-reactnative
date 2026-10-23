import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { TABULAR, useFinancePalette, type FinancePalette } from '@/components/finance/ui';
import {
  compareDays,
  compareSeries,
  formatSpan,
  seriesDeltas,
  type ComparePair,
  type SeriesDelta,
} from '@/lib/compare-math';
import { formatCoverageDate, formatPct, formatPp, formatUsd, formatUsdSigned } from '@/lib/finance-coverage';

const BREAKDOWN_ROWS = 6;

export type CompareBreakdownSeries = { key: string; label: string; color: string; values: (number | null)[] };

/** Small "A" / "B" badge shared by the card and the chart crosshairs. */
export function PointBadge({ label, color, size = 18 }: { label: 'A' | 'B'; color: string; size?: number }) {
  const palette = useFinancePalette();
  return (
    <View
      style={[
        styles.badge,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color, borderColor: palette.card },
      ]}
    >
      <Text style={[styles.badgeText, { color: palette.card, fontSize: size * 0.58 }]}>{label}</Text>
    </View>
  );
}

/**
 * A/B comparison summary for a pinned pair of chart points. `values` is the
 * headline series (net worth, an account balance); `breakdown` adds per-series
 * deltas sorted by size; `benchmark` reports the overlay's % over the same span.
 */
export function CompareCard({
  dates,
  pair,
  label,
  values,
  invert = false,
  benchmark,
  breakdown,
  breakdownTitle = 'Change by series',
  onClose,
}: {
  dates: string[];
  pair: ComparePair;
  label: string;
  values: (number | null)[];
  /** Balance owed: a decrease is good. */
  invert?: boolean;
  benchmark?: { label: string; color: string; values: (number | null)[] };
  breakdown?: CompareBreakdownSeries[];
  breakdownTitle?: string;
  onClose: () => void;
}) {
  const palette = useFinancePalette();
  const pending = pair.a === pair.b;
  const stat = compareSeries(values, dates, pair);
  const days = compareDays(dates, pair);
  const bench = benchmark ? compareSeries(benchmark.values, dates, pair) : null;
  const rows = breakdown && !pending ? seriesDeltas(breakdown, pair, values[pair.a] ?? 0) : [];
  const tone = (delta: number) => toneColor(palette, invert ? -delta : delta);
  const a = values[pair.a];
  const b = values[pair.b];

  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={
        stat && !pending
          ? `${label} from ${formatCoverageDate(dates[pair.a])} to ${formatCoverageDate(dates[pair.b])}: ${formatUsdSigned(stat.delta)}, ${formatPct(stat.pct)}`
          : `Point A ${formatCoverageDate(dates[pair.a])}`
      }
      style={[styles.card, { backgroundColor: palette.cardAlt, borderColor: palette.border }]}
    >
      <View style={styles.ends}>
        <End badge="A" color={palette.accent} date={dates[pair.a]} value={a} />
        {pending ? (
          <Text style={[styles.hint, { color: palette.muted }]}>
            {Platform.OS === 'web' ? 'Shift-click a second point, or drag across the chart' : 'Place a second finger'}
          </Text>
        ) : (
          <>
            <Text style={[styles.arrow, { color: palette.subtle }]}>→</Text>
            <End badge="B" color={palette.accent} date={dates[pair.b]} value={b} />
          </>
        )}
        <Pressable
          onPress={onClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Clear comparison"
          style={({ pressed }) => [styles.close, { backgroundColor: pressed ? palette.pressed : palette.chip }]}
        >
          <Text style={[styles.closeText, { color: palette.muted }]}>✕</Text>
        </Pressable>
      </View>

      {!pending ? (
        stat ? (
          <View style={styles.deltaRow}>
            <Text style={[styles.delta, { color: tone(stat.delta) }]}>
              {formatUsdSigned(stat.delta)}
              <Text style={styles.deltaPct}> ({formatPct(stat.pct)})</Text>
            </Text>
            <Text style={[styles.meta, { color: palette.muted }]}>
              {formatSpan(days)}
              {stat.annualized != null ? ` · ${formatPct(stat.annualized)}/yr annualized` : ''}
            </Text>
          </View>
        ) : (
          <Text style={[styles.meta, { color: palette.muted }]}>
            No {label.toLowerCase()} data at one of the points.
          </Text>
        )
      ) : null}

      {!pending && benchmark ? (
        <View style={styles.benchRow}>
          <View style={[styles.benchSwatch, { borderColor: benchmark.color }]} />
          <Text style={[styles.meta, { color: palette.muted }]}>{benchmark.label}</Text>
          <Text style={[styles.benchValue, { color: bench ? toneColor(palette, bench.delta) : palette.subtle }]}>
            {bench ? formatPct(bench.pct) : '—'}
          </Text>
          {bench?.annualized != null ? (
            <Text style={[styles.meta, { color: palette.subtle }]}>{formatPct(bench.annualized)}/yr</Text>
          ) : null}
        </View>
      ) : null}

      {rows.length > 0 ? <Breakdown title={breakdownTitle} rows={rows} palette={palette} /> : null}
    </View>
  );
}

function End({
  badge,
  color,
  date,
  value,
}: {
  badge: 'A' | 'B';
  color: string;
  date: string;
  value: number | null | undefined;
}) {
  const palette = useFinancePalette();
  return (
    <View style={styles.end}>
      <PointBadge label={badge} color={color} />
      <View>
        <Text style={[styles.endDate, { color: palette.muted }]}>{formatCoverageDate(date)}</Text>
        <Text style={[styles.endValue, { color: palette.text }]}>{value == null ? '—' : formatUsd(value)}</Text>
      </View>
    </View>
  );
}

function Breakdown({ title, rows, palette }: { title: string; rows: SeriesDelta[]; palette: FinancePalette }) {
  const shown = rows.slice(0, BREAKDOWN_ROWS);
  return (
    <View style={[styles.breakdown, { borderTopColor: palette.hairline }]}>
      <Text style={[styles.breakdownTitle, { color: palette.subtle }]}>{title}</Text>
      {shown.map((row) => (
        <View key={row.key} style={styles.breakdownRow}>
          <View style={[styles.dot, { backgroundColor: row.color }]} />
          <Text style={[styles.rowLabel, { color: palette.text }]} numberOfLines={1}>
            {row.label}
          </Text>
          <Text style={[styles.rowDelta, { color: toneColor(palette, row.delta) }]}>{formatUsdSigned(row.delta)}</Text>
          <Text style={[styles.rowPp, { color: palette.muted }]}>{formatPp(row.contribution)}</Text>
        </View>
      ))}
      {rows.length > BREAKDOWN_ROWS ? (
        <Text style={[styles.meta, { color: palette.subtle }]}>+{rows.length - BREAKDOWN_ROWS} more</Text>
      ) : null}
    </View>
  );
}

function toneColor(palette: FinancePalette, delta: number): string {
  if (delta > 0) return palette.positive;
  if (delta < 0) return palette.negative;
  return palette.muted;
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 8 },
  ends: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  end: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  endDate: { fontSize: 11, fontWeight: '600' },
  endValue: { fontSize: 15, fontWeight: '700', ...TABULAR },
  arrow: { fontSize: 15 },
  hint: { fontSize: 12, flexShrink: 1 },
  close: {
    marginLeft: 'auto',
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { fontSize: 12, fontWeight: '700' },
  deltaRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 10, rowGap: 2 },
  delta: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, ...TABULAR },
  deltaPct: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 12, ...TABULAR },
  benchRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  benchSwatch: { width: 14, height: 0, borderTopWidth: 2, borderStyle: 'dashed' },
  benchValue: { fontSize: 13, fontWeight: '700', ...TABULAR },
  breakdown: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, gap: 5 },
  breakdownTitle: { fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rowLabel: { flex: 1, fontSize: 13 },
  rowDelta: { fontSize: 13, fontWeight: '700', ...TABULAR },
  rowPp: { fontSize: 12, minWidth: 64, textAlign: 'right', ...TABULAR },
  badge: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  badgeText: { fontWeight: '800' },
});
