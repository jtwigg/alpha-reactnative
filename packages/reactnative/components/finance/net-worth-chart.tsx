import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { moneyAndPct, type TooltipRow } from '@/components/finance/chart-tooltip';
import { CompareCard } from '@/components/finance/compare-card';
import { LineChart, type ChartSeries } from '@/components/finance/line-chart';
import { LegendChip } from '@/components/finance/legend-chip';
import { FText, LegendItem, useFinancePalette } from '@/components/finance/ui';
import { useSeriesHighlight } from '@/hooks/use-series-highlight';
import { useChartColors } from '@/lib/finance-colors';
import { classLabel, formatCoverageDate } from '@/lib/finance-coverage';
import type { ChartPoint, CoverageMarker } from '../../../server/convex/finance/series';

export type BenchmarkLine = {
  label: string;
  color: string;
  values: Array<number | null>;
};

export function NetWorthChart({
  points,
  markers,
  scrubIndex,
  onScrub,
  benchmark,
  seriesLabel = 'Net worth',
  showMarkerNotes = true,
  color,
  height,
  headline = false,
  invert = false,
}: {
  points: ChartPoint[];
  markers: CoverageMarker[];
  scrubIndex: number | null;
  onScrub: (index: number | null) => void;
  benchmark?: BenchmarkLine;
  seriesLabel?: string;
  showMarkerNotes?: boolean;
  color?: string;
  height?: number;
  /** Values live in a hero above the chart; the tooltip shrinks to a date. */
  headline?: boolean;
  /** Balance owed: a decrease is good in the compare card. */
  invert?: boolean;
}) {
  const palette = useFinancePalette();
  const colors = useChartColors();
  const lineColor = color ?? palette.accent;
  const highlight = useSeriesHighlight();
  const dates = useMemo(() => points.map((point) => point.asOf), [points]);
  const series = useMemo<ChartSeries[]>(() => {
    const out: ChartSeries[] = [
      {
        key: 'primary',
        label: seriesLabel,
        color: lineColor,
        values: points.map((point) => point.total),
        gaps: points.map((point) => point.interpolated),
        fill: true,
        strokeWidth: 2.2,
      },
    ];
    if (benchmark) {
      out.push({
        key: 'benchmark',
        label: benchmark.label,
        color: benchmark.color,
        values: benchmark.values,
        dashed: true,
        strokeWidth: 1.6,
      });
    }
    return out;
  }, [benchmark, lineColor, points, seriesLabel]);

  if (points.length < 2) {
    return (
      <FText variant="callout" tone="muted" style={styles.empty}>
        Not enough history to chart yet.
      </FText>
    );
  }

  const first = points[0];
  const hasGaps = points.some((point) => point.interpolated);
  const tooltipRows = (index: number): TooltipRow[] => {
    const point = points[index];
    const rows: TooltipRow[] = [
      {
        key: 'primary',
        label: seriesLabel,
        color: lineColor,
        emphasis: true,
        ...moneyAndPct(point.total, first.total),
      },
    ];
    const benchValue = benchmark?.values[index];
    const benchStart = benchmark?.values.find((value) => value != null);
    if (benchmark && benchValue != null && benchStart != null) {
      rows.push({
        key: 'benchmark',
        label: benchmark.label,
        color: benchmark.color,
        ...moneyAndPct(benchValue, benchStart),
      });
    }
    return rows;
  };

  return (
    <View style={styles.wrap}>
      <LineChart
        dates={dates}
        series={series}
        scrubIndex={scrubIndex}
        onScrub={onScrub}
        tooltipRows={tooltipRows}
        tooltipMode={headline && !benchmark ? 'date' : 'full'}
        height={height}
        markers={markers.map((marker) => ({
          asOf: marker.asOf,
          color: colors.classColor(marker.class),
        }))}
        highlight={highlight}
        renderCompare={(pair, clear) => (
          <CompareCard
            dates={dates}
            pair={pair}
            label={seriesLabel}
            values={series[0].values}
            invert={invert}
            benchmark={benchmark}
            onClose={clear}
          />
        )}
      />
      {headline && !benchmark && !hasGaps ? null : (
        <View style={styles.legend}>
          {!headline || benchmark ? (
            <LegendChip seriesKey="primary" label={seriesLabel} color={lineColor} highlight={highlight} />
          ) : null}
          {benchmark ? (
            <LegendChip
              seriesKey="benchmark"
              label={`${benchmark.label} (rebased)`}
              color={benchmark.color}
              swatch="dashed"
              highlight={highlight}
            />
          ) : null}
          {hasGaps ? <LegendItem color={lineColor} dashed label="Interpolated" /> : null}
        </View>
      )}
      {showMarkerNotes ? <CoverageMarkerNotes markers={markers} /> : null}
    </View>
  );
}

/** Explains the faint vertical lines: where each class's history begins. */
export function CoverageMarkerNotes({ markers }: { markers: CoverageMarker[] }) {
  const { classColor } = useChartColors();
  if (markers.length === 0) return null;
  return (
    <View style={styles.markers}>
      {markers.map((marker) => (
        <View key={`${marker.class}-${marker.asOf}`} style={styles.markerNote}>
          <View style={[styles.markerTick, { backgroundColor: classColor(marker.class) }]} />
          <FText variant="caption" tone="subtle">
            {classLabel(marker.class)} from {formatCoverageDate(marker.asOf)}
          </FText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  empty: { paddingVertical: 24, textAlign: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  markers: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 },
  markerNote: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  markerTick: { width: 2, height: 10, borderRadius: 1, opacity: 0.7 },
});
