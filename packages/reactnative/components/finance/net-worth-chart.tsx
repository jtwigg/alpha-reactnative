import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { moneyAndPct, type TooltipRow } from '@/components/finance/chart-tooltip';
import { LineChart, type ChartSeries } from '@/components/finance/line-chart';
import { LegendChip } from '@/components/finance/legend-chip';
import { FText, LegendItem, useFinancePalette } from '@/components/finance/ui';
import { useSeriesHighlight } from '@/hooks/use-series-highlight';
import { classColor, classLabel, formatCoverageDate } from '@/lib/finance-coverage';
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
}: {
  points: ChartPoint[];
  markers: CoverageMarker[];
  scrubIndex: number | null;
  onScrub: (index: number | null) => void;
  benchmark?: BenchmarkLine;
  seriesLabel?: string;
  showMarkerNotes?: boolean;
  color?: string;
}) {
  const palette = useFinancePalette();
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
        strokeWidth: 2.4,
      },
    ];
    if (benchmark) {
      out.push({
        key: 'benchmark',
        label: benchmark.label,
        color: benchmark.color,
        values: benchmark.values,
        dashed: true,
        strokeWidth: 1.8,
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
      { key: 'primary', label: seriesLabel, color: lineColor, emphasis: true, ...moneyAndPct(point.total, first.total) },
    ];
    const benchValue = benchmark?.values[index];
    const benchStart = benchmark?.values.find((value) => value != null);
    if (benchmark && benchValue != null && benchStart != null) {
      rows.push({ key: 'benchmark', label: benchmark.label, color: benchmark.color, ...moneyAndPct(benchValue, benchStart) });
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
        markers={markers.map((marker) => ({ asOf: marker.asOf, color: classColor(marker.class) }))}
        highlight={highlight}
      />
      <View style={styles.legend}>
        <LegendChip seriesKey="primary" label={seriesLabel} color={lineColor} highlight={highlight} />
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
      {showMarkerNotes && markers.length > 0 ? (
        <View style={styles.markers}>
          {markers.map((marker) => (
            <View key={`${marker.class}-${marker.asOf}`} style={styles.markerNote}>
              <View style={[styles.markerTick, { backgroundColor: classColor(marker.class) }]} />
              <FText variant="caption" tone="muted">
                {classLabel(marker.class)} from {formatCoverageDate(marker.asOf)}
              </FText>
            </View>
          ))}
        </View>
      ) : null}
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
