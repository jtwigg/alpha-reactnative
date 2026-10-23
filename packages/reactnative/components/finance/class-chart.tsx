import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { classRows } from '@/components/finance/chart-tooltip';
import { LineChart, type ChartSeries } from '@/components/finance/line-chart';
import { LegendChip } from '@/components/finance/legend-chip';
import { useSeriesHighlight } from '@/hooks/use-series-highlight';
import { classColor, classLabel } from '@/lib/finance-coverage';
import type { ChartPoint } from '../../../server/convex/finance/series';

export function ClassChart({
  points,
  scrubIndex,
  onScrub,
}: {
  points: ChartPoint[];
  scrubIndex: number | null;
  onScrub: (index: number | null) => void;
}) {
  const classes = useMemo(
    () => Array.from(new Set(points.flatMap((point) => Object.keys(point.byClass)))).sort(),
    [points],
  );
  const dates = useMemo(() => points.map((point) => point.asOf), [points]);
  const highlight = useSeriesHighlight();
  const series = useMemo<ChartSeries[]>(
    () =>
      classes.map((className) => ({
        key: className,
        label: classLabel(className),
        color: classColor(className),
        values: points.map((point) => point.byClass[className] ?? null),
        gaps: points.map((point) => point.interpolated),
      })),
    [classes, points],
  );

  if (points.length < 2 || classes.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <LineChart
        dates={dates}
        series={series}
        scrubIndex={scrubIndex}
        onScrub={onScrub}
        includeZero
        height={200}
        tooltipRows={(index) => classRows(points[index].byClass)}
        highlight={highlight}
      />
      <View style={styles.legend}>
        {classes.map((className) => (
          <LegendChip
            key={className}
            seriesKey={className}
            label={classLabel(className)}
            color={classColor(className)}
            highlight={highlight}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
});
