import { memo, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChartTouch } from '@/components/finance/chart-touch';
import { FText, TABULAR, useFinancePalette } from '@/components/finance/ui';
import { axisDateLabel, formatCompactUsd, niceTicks, spanInDays } from '@/lib/chart-math';
import { formatCoverageDate, formatUsd } from '@/lib/finance-coverage';
import type { StackModel } from '@/lib/stack-math';

const PAD = { top: 8, right: 58, bottom: 26, left: 2 };

type Geometry = {
  ticks: number[];
  y: (value: number) => number;
  slot: number;
  barWidth: number;
  center: (index: number) => number;
};

export function StackedChart({
  dates,
  model,
  scrubIndex,
  onScrub,
  height = 240,
  netLabel,
}: {
  dates: string[];
  model: StackModel;
  scrubIndex: number | null;
  onScrub: (index: number | null) => void;
  height?: number;
  netLabel: string;
}) {
  const palette = useFinancePalette();
  const [width, setWidth] = useState(0);
  const count = dates.length;

  const geometry = useMemo<Geometry | null>(() => {
    if (width <= 0 || count === 0) return null;
    const max = Math.max(0, ...model.positive);
    const min = Math.min(0, ...model.negative);
    const ticks = niceTicks(min, max === min ? min + 1 : max, 4);
    const y0 = ticks[0];
    const y1 = ticks[ticks.length - 1];
    const innerW = Math.max(width - PAD.left - PAD.right, 1);
    const innerH = Math.max(height - PAD.top - PAD.bottom, 1);
    const slot = innerW / count;
    const barWidth = slot >= 4 ? Math.max(slot * 0.72, 1.5) : Math.max(slot, 1);
    return {
      ticks,
      y: (value: number) => PAD.top + (1 - (value - y0) / (y1 - y0 || 1)) * innerH,
      slot,
      barWidth,
      center: (index: number) => PAD.left + slot * (index + 0.5),
    };
  }, [count, height, model.negative, model.positive, width]);

  const active = scrubIndex ?? (count > 0 ? count - 1 : null);
  const span = count > 1 ? spanInDays(dates[0], dates[count - 1]) : 0;
  const xLabels =
    count > 1 ? [0, Math.round((count - 1) / 2), count - 1].filter((v, i, a) => a.indexOf(v) === i) : [];

  return (
    <View style={styles.wrap}>
      <StackLegend
        date={active != null ? dates[active] : undefined}
        model={model}
        index={active}
        netLabel={netLabel}
        live={scrubIndex != null}
      />
      <ChartTouch
        count={count}
        padLeft={PAD.left + (geometry?.slot ?? 0) / 2}
        padRight={PAD.right + (geometry?.slot ?? 0) / 2}
        height={height}
        onScrub={onScrub}
        onWidth={setWidth}>
        {geometry ? (
          <>
            {geometry.ticks.map((tick) => (
              <View key={`grid-${tick}`}>
                <View
                  style={[
                    styles.grid,
                    {
                      top: geometry.y(tick),
                      left: PAD.left,
                      right: PAD.right - 6,
                      backgroundColor: tick === 0 ? palette.border : palette.grid,
                    },
                  ]}
                />
                <Text style={[styles.yLabel, { top: geometry.y(tick) - 8, color: palette.subtle }]} numberOfLines={1}>
                  {formatCompactUsd(tick)}
                </Text>
              </View>
            ))}
            {scrubIndex != null ? (
              <View
                style={[
                  styles.band,
                  {
                    left: geometry.center(scrubIndex) - geometry.slot / 2,
                    width: geometry.slot,
                    top: PAD.top,
                    height: height - PAD.top - PAD.bottom,
                    backgroundColor: palette.pressed,
                  },
                ]}
              />
            ) : null}
            <Bars model={model} geometry={geometry} />
            {scrubIndex != null ? (
              <View
                style={[
                  styles.netTick,
                  {
                    left: geometry.center(scrubIndex) - geometry.barWidth / 2 - 2,
                    width: geometry.barWidth + 4,
                    top: geometry.y(model.net[scrubIndex] ?? 0) - 1,
                    backgroundColor: palette.crosshair,
                  },
                ]}
              />
            ) : null}
            {xLabels.map((index, i) => (
              <Text
                key={`x-${index}`}
                numberOfLines={1}
                style={[
                  styles.xLabel,
                  { color: palette.subtle, top: height - 18 },
                  i === 0
                    ? { left: PAD.left }
                    : i === xLabels.length - 1
                      ? { right: PAD.right - 6, textAlign: 'right' }
                      : { left: geometry.center(index) - 40, width: 80, textAlign: 'center' },
                ]}>
                {axisDateLabel(dates[index], span)}
              </Text>
            ))}
          </>
        ) : null}
      </ChartTouch>
    </View>
  );
}

const Bars = memo(function Bars({ model, geometry }: { model: StackModel; geometry: Geometry }) {
  const views: React.ReactElement[] = [];
  const count = model.positive.length;
  for (let i = 0; i < count; i += 1) {
    if (!model.covered[i]) continue;
    const left = geometry.center(i) - geometry.barWidth / 2;
    let up = 0;
    let down = 0;
    for (const series of model.series) {
      const value = series.values[i];
      if (!value) continue;
      const from = value > 0 ? up : down;
      const to = from + value;
      if (value > 0) up = to;
      else down = to;
      const top = Math.min(geometry.y(from), geometry.y(to));
      const bottom = Math.max(geometry.y(from), geometry.y(to));
      views.push(
        <View
          key={`${series.key}-${i}`}
          style={{
            position: 'absolute',
            left,
            width: geometry.barWidth,
            top,
            height: Math.max(bottom - top, 0.5),
            backgroundColor: series.color,
          }}
        />,
      );
    }
  }
  return <View style={StyleSheet.absoluteFill}>{views}</View>;
});

function StackLegend({
  date,
  model,
  index,
  netLabel,
  live,
}: {
  date?: string;
  model: StackModel;
  index: number | null;
  netLabel: string;
  live: boolean;
}) {
  const palette = useFinancePalette();
  if (index == null || date == null) return null;
  return (
    <View style={styles.legend} accessibilityLiveRegion={live ? 'polite' : 'none'}>
      <View style={styles.legendHead}>
        <FText variant="caption" tone={live ? 'text' : 'muted'} style={styles.legendDate}>
          {formatCoverageDate(date)}
        </FText>
        <FText variant="caption" tone="muted">
          {netLabel}{' '}
          <Text style={[styles.legendNet, TABULAR, { color: palette.text }]}>
            {model.covered[index] ? formatUsd(model.net[index]) : '—'}
          </Text>
        </FText>
      </View>
      <View style={styles.legendItems}>
        {model.series.map((series) => (
          <View key={series.key} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: series.color }]} />
            <FText variant="caption" tone="muted" numberOfLines={1} style={styles.legendLabel}>
              {series.label}
            </FText>
            <Text
              style={[
                styles.legendValue,
                TABULAR,
                { color: series.values[index] < 0 ? palette.negative : palette.text },
              ]}>
              {series.values[index] === 0 ? '—' : formatCompactUsd(series.values[index])}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  grid: { position: 'absolute', height: StyleSheet.hairlineWidth },
  yLabel: { position: 'absolute', right: 0, width: 52, fontSize: 11, textAlign: 'right', ...TABULAR },
  xLabel: { position: 'absolute', fontSize: 11 },
  band: { position: 'absolute', borderRadius: 3 },
  netTick: { position: 'absolute', height: 2, borderRadius: 1 },
  legend: { gap: 6, minHeight: 44 },
  legendHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 12, rowGap: 2 },
  legendDate: { fontWeight: '700' },
  legendNet: { fontWeight: '700', fontSize: 13 },
  legendItems: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: 220 },
  swatch: { width: 9, height: 9, borderRadius: 2 },
  legendLabel: { flexShrink: 1 },
  legendValue: { fontSize: 12, fontWeight: '600' },
});
