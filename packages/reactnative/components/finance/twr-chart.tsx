import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { moneyAndPct, type TooltipRow } from '@/components/finance/chart-tooltip';
import { CompareCard } from '@/components/finance/compare-card';
import { LineChart, type ChartSeries } from '@/components/finance/line-chart';
import { LegendChip } from '@/components/finance/legend-chip';
import { FText, LegendItem, TABULAR, useFinancePalette } from '@/components/finance/ui';
import { useSeriesHighlight } from '@/hooks/use-series-highlight';
import { useChartColors } from '@/lib/finance-colors';
import { formatPct } from '@/lib/finance-coverage';

export type TwrChartPoint = {
  asOf: string;
  value: number;
  netInvested: number;
  sp500Equiv: number;
  valueInterpolated: boolean;
  estimated: boolean;
};

export type TwrChartHeader = {
  cumulative: number;
  annualized: number | null;
  window: string | null;
  startDate: string | null;
  asOf: string | null;
  source: 'returns' | 'computed';
};

export function TwrChart({
  points,
  height = 220,
}: {
  points: TwrChartPoint[];
  height?: number;
}) {
  const palette = useFinancePalette();
  const colors = useChartColors();
  const highlight = useSeriesHighlight();
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);
  const dates = useMemo(() => points.map((point) => point.asOf), [points]);
  const dimFlags = useMemo(
    () => points.map((point) => point.estimated || point.valueInterpolated),
    [points],
  );
  const hasDim = dimFlags.some(Boolean);
  const series = useMemo<ChartSeries[]>(
    () => [
      {
        key: 'value',
        label: 'Value',
        color: palette.accent,
        values: points.map((point) => point.value),
        gaps: points.map((point) => point.valueInterpolated || point.estimated),
        strokeWidth: 2.2,
      },
      {
        key: 'invested',
        label: 'Net invested',
        color: palette.muted,
        values: points.map((point) => point.netInvested),
        stepAfter: true,
        strokeWidth: 1.7,
      },
      {
        key: 'sp500',
        label: 'S&P 500',
        color: colors.benchmark,
        values: points.map((point) => point.sp500Equiv),
        dashed: true,
        strokeWidth: 1.6,
      },
    ],
    [colors.benchmark, palette.accent, palette.muted, points],
  );

  if (points.length < 2) {
    return (
      <FText variant="callout" tone="muted" style={styles.empty}>
        No return path for this range yet.
      </FText>
    );
  }

  const first = points[0];
  const tooltipRows = (index: number): TooltipRow[] => {
    const point = points[index];
    return [
      {
        key: 'value',
        label: 'Value',
        color: palette.accent,
        emphasis: true,
        ...moneyAndPct(point.value, first.value),
      },
      {
        key: 'invested',
        label: 'Net invested',
        color: palette.muted,
        ...moneyAndPct(point.netInvested, first.netInvested),
      },
      {
        key: 'sp500',
        label: 'S&P 500',
        color: colors.benchmark,
        ...moneyAndPct(point.sp500Equiv, first.sp500Equiv),
      },
    ];
  };

  return (
    <View style={styles.wrap}>
      <LineChart
        dates={dates}
        series={series}
        scrubIndex={scrubIndex}
        onScrub={setScrubIndex}
        tooltipRows={tooltipRows}
        height={height}
        highlight={highlight}
        dimFlags={dimFlags}
        bands={[
          {
            topKey: 'value',
            bottomKey: 'invested',
            positiveColor: palette.positive,
            negativeColor: palette.negative,
          },
        ]}
        renderCompare={(pair, clear) => (
          <CompareCard
            dates={dates}
            pair={pair}
            label="Value"
            values={series[0].values}
            benchmark={{ label: 'S&P 500', color: colors.benchmark, values: series[2].values }}
            breakdown={[
              { key: 'value', label: 'Value', color: palette.accent, values: series[0].values },
              { key: 'invested', label: 'Net invested', color: palette.muted, values: series[1].values },
              { key: 'sp500', label: 'S&P 500', color: colors.benchmark, values: series[2].values },
            ]}
            onClose={clear}
          />
        )}
      />
      <View style={styles.legend}>
        <LegendChip seriesKey="value" label="Value" color={palette.accent} highlight={highlight} />
        <LegendChip
          seriesKey="invested"
          label="Net invested"
          color={palette.muted}
          swatch="step"
          highlight={highlight}
        />
        <LegendChip
          seriesKey="sp500"
          label="S&P 500"
          color={colors.benchmark}
          swatch="dashed"
          highlight={highlight}
        />
        {hasDim ? <LegendItem color={palette.subtle} hatched label="Estimated / interpolated" /> : null}
      </View>
    </View>
  );
}

export function TwrHeader({
  twr,
  sp500Twr,
}: {
  twr: TwrChartHeader | null;
  sp500Twr: TwrChartHeader | null;
}) {
  if (!twr && !sp500Twr) return null;
  return (
    <View style={styles.stats}>
      <View style={styles.stat}>
        <FText variant="caption" tone="muted">
          Return
        </FText>
        <FText variant="title" style={TABULAR} tone={(twr?.cumulative ?? 0) >= 0 ? 'positive' : 'negative'}>
          {twr ? formatPct(twr.cumulative) : '—'}
        </FText>
      </View>
      <View style={styles.stat}>
        <FText variant="caption" tone="muted">
          S&P 500
        </FText>
        <FText variant="title" style={TABULAR} tone={(sp500Twr?.cumulative ?? 0) >= 0 ? 'positive' : 'negative'}>
          {sp500Twr ? formatPct(sp500Twr.cumulative) : '—'}
        </FText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  empty: { paddingVertical: 24, textAlign: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  stats: { flexDirection: 'row', gap: 24, marginTop: 4, marginBottom: 4 },
  stat: { flex: 1, gap: 2 },
});
