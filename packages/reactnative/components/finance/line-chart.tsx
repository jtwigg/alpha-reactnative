import { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { ChartTooltip, type TooltipRow } from '@/components/finance/chart-tooltip';
import { ChartTouch } from '@/components/finance/chart-touch';
import { TABULAR, useFinancePalette } from '@/components/finance/ui';
import type { SeriesHighlight } from '@/hooks/use-series-highlight';
import { seriesOpacity } from '@/lib/series-highlight';
import {
  areaPath,
  axisDateLabel,
  buildSegments,
  formatCompactUsd,
  niceTicks,
  segmentsToPath,
  spanInDays,
  type Segment,
} from '@/lib/chart-math';

export type ChartSeries = {
  key: string;
  label: string;
  color: string;
  values: Array<number | null>;
  /** Per-point interpolation flags; segments touching one are dashed. */
  gaps?: boolean[];
  dashed?: boolean;
  fill?: boolean;
  strokeWidth?: number;
};

export type ChartMarker = { asOf: string; color: string };

const PAD = { top: 14, right: 58, bottom: 26, left: 2 };
const TAP_HIT_PX = 24;

export function LineChart({
  dates,
  series,
  scrubIndex,
  onScrub,
  tooltipRows,
  height = 220,
  includeZero = false,
  markers = [],
  highlight,
}: {
  dates: string[];
  series: ChartSeries[];
  scrubIndex: number | null;
  onScrub: (index: number | null) => void;
  tooltipRows: (index: number) => TooltipRow[];
  height?: number;
  includeZero?: boolean;
  markers?: ChartMarker[];
  /** Legend-driven emphasis; hidden series are dropped from the scale. */
  highlight?: SeriesHighlight;
}) {
  const palette = useFinancePalette();
  const [width, setWidth] = useState(0);
  const count = dates.length;
  const active = highlight?.active ?? null;
  const hidden = highlight?.hidden;
  const visible = useMemo(() => {
    const shown = hidden && hidden.size > 0 ? series.filter((s) => !hidden.has(s.key)) : series;
    return active ? [...shown.filter((s) => s.key !== active), ...shown.filter((s) => s.key === active)] : shown;
  }, [active, hidden, series]);

  const geometry = useMemo(() => {
    if (width <= 0 || count < 2) return null;
    const values = visible.flatMap((s) => s.values.filter((v): v is number => v != null));
    if (values.length === 0) return null;
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (includeZero) {
      min = Math.min(0, min);
      max = Math.max(0, max);
    }
    const ticks = niceTicks(min, max, 4);
    const y0 = ticks[0];
    const y1 = ticks[ticks.length - 1];
    const innerW = Math.max(width - PAD.left - PAD.right, 1);
    const innerH = Math.max(height - PAD.top - PAD.bottom, 1);
    const x = (index: number) => PAD.left + (index / (count - 1)) * innerW;
    const y = (value: number) => PAD.top + (1 - (value - y0) / (y1 - y0 || 1)) * innerH;
    const lines = visible.map((s) => ({
      series: s,
      segments: buildSegments(s.values, x, y, s.gaps, s.dashed),
    }));
    return { ticks, x, y, lines, baseline: PAD.top + innerH, innerH };
  }, [count, height, includeZero, visible, width]);

  const onTap = (index: number, tapY: number) => {
    if (!highlight || !geometry) return;
    let best: { key: string; distance: number } | null = null;
    for (const { series: s } of geometry.lines) {
      const value = s.values[index];
      if (value == null) continue;
      const distance = Math.abs(geometry.y(value) - tapY);
      if (distance <= TAP_HIT_PX && (!best || distance < best.distance)) best = { key: s.key, distance };
    }
    if (best) highlight.toggle(best.key);
    else highlight.clear();
  };

  const span = count > 1 ? spanInDays(dates[0], dates[count - 1]) : 0;
  const xLabels =
    count > 1
      ? [0, Math.round((count - 1) / 2), count - 1].filter((v, i, a) => a.indexOf(v) === i)
      : [];
  const hairX = geometry && scrubIndex != null ? geometry.x(scrubIndex) : null;
  const markerIndex = (asOf: string) => {
    let best = 0;
    dates.forEach((date, index) => {
      if (date <= asOf) best = index;
    });
    return best;
  };

  return (
    <View style={styles.wrap}>
      <ChartTouch
        count={count}
        padLeft={PAD.left}
        padRight={PAD.right}
        height={height}
        onScrub={onScrub}
        onWidth={setWidth}
        onTap={highlight ? onTap : undefined}>
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
                      backgroundColor: tick === 0 && includeZero ? palette.border : palette.grid,
                    },
                  ]}
                />
                <Text
                  style={[styles.yLabel, { top: geometry.y(tick) - 8, color: palette.subtle }]}
                  numberOfLines={1}>
                  {formatCompactUsd(tick)}
                </Text>
              </View>
            ))}
            {markers.map((marker) => (
              <View
                key={`marker-${marker.asOf}-${marker.color}`}
                style={[
                  styles.marker,
                  {
                    left: geometry.x(markerIndex(marker.asOf)),
                    top: PAD.top,
                    height: geometry.innerH,
                    backgroundColor: marker.color,
                  },
                ]}
              />
            ))}
            {Platform.OS === 'web' ? (
              <WebLines width={width} height={height} geometry={geometry} active={active} />
            ) : (
              <NativeLines geometry={geometry} active={active} />
            )}
            {hairX != null ? (
              <>
                <View
                  style={[
                    styles.crosshair,
                    {
                      left: hairX,
                      top: PAD.top - 4,
                      height: geometry.innerH + 4,
                      backgroundColor: palette.crosshair,
                    },
                  ]}
                />
                {geometry.lines.map(({ series: s }) => {
                  const value = s.values[scrubIndex!];
                  if (value == null) return null;
                  return (
                    <View
                      key={`dot-${s.key}`}
                      style={[
                        styles.dot,
                        {
                          left: hairX - 5,
                          top: geometry.y(value) - 5,
                          backgroundColor: s.color,
                          borderColor: palette.card,
                          opacity: seriesOpacity(s.key, active),
                        },
                      ]}
                    />
                  );
                })}
              </>
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
                      : { left: geometry.x(index) - 40, width: 80, textAlign: 'center' },
                ]}>
                {axisDateLabel(dates[index], span)}
              </Text>
            ))}
            {scrubIndex != null && hairX != null ? (
              <ChartTooltip
                date={dates[scrubIndex]}
                rows={tooltipRows(scrubIndex).filter((row) => !row.key || !hidden?.has(row.key))}
                highlightKey={active}
                style={[
                  styles.tooltip,
                  hairX > width / 2 ? { right: width - hairX + 12 } : { left: hairX + 12 },
                  tooltipBounds(hairX, width),
                ]}
              />
            ) : null}
          </>
        ) : null}
      </ChartTouch>
    </View>
  );
}

function tooltipBounds(hairX: number, width: number) {
  const available = Math.max((hairX > width / 2 ? hairX : width - hairX) - 16, 140);
  return { maxWidth: Math.min(available, 280), minWidth: Math.min(190, available) };
}

type Geometry = {
  lines: Array<{ series: ChartSeries; segments: Segment[] }>;
  x: (index: number) => number;
  y: (value: number) => number;
  baseline: number;
};

function WebLines({
  width,
  height,
  geometry,
  active,
}: {
  width: number;
  height: number;
  geometry: Geometry;
  active: string | null;
}) {
  const gradientId = useMemo(() => `fill-${Math.random().toString(36).slice(2, 10)}`, []);
  const fillSeries = geometry.lines.find(({ series }) => series.fill);
  return (
    <svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
      {fillSeries ? (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={fillSeries.series.color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={fillSeries.series.color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d={areaPath(fillSeries.series.values, geometry.x, geometry.y, geometry.baseline)}
            fill={`url(#${gradientId})`}
            fillOpacity={seriesOpacity(fillSeries.series.key, active)}
            stroke="none"
          />
        </>
      ) : null}
      {geometry.lines.map(({ series, segments }) => {
        const solid = segmentsToPath(segments.filter((seg) => !seg.dashed));
        const dashed = segmentsToPath(segments.filter((seg) => seg.dashed));
        const strokeWidth = series.strokeWidth ?? 2;
        return (
          <g key={series.key} opacity={seriesOpacity(series.key, active)}>
            {solid ? (
              <path
                d={solid}
                fill="none"
                stroke={series.color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
            {dashed ? (
              <path
                d={dashed}
                fill="none"
                stroke={series.color}
                strokeOpacity={series.dashed ? 0.9 : 0.55}
                strokeWidth={Math.max(strokeWidth - 0.4, 1.2)}
                strokeDasharray="5 4"
                strokeLinecap="round"
              />
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function NativeLines({ geometry, active }: { geometry: Geometry; active: string | null }) {
  const fillSeries = geometry.lines.find(({ series }) => series.fill);
  return (
    <>
      {fillSeries
        ? fillSeries.segments.map((seg, i) => {
            const top = Math.min(seg.y1, seg.y2);
            return (
              <View
                key={`fill-${i}`}
                style={{
                  position: 'absolute',
                  left: seg.x1,
                  width: Math.max(seg.x2 - seg.x1, 0.5) + 0.5,
                  top,
                  height: Math.max(geometry.baseline - top, 0),
                  backgroundColor: fillSeries.series.color,
                  opacity: 0.07 * seriesOpacity(fillSeries.series.key, active),
                }}
              />
            );
          })
        : null}
      {geometry.lines.map(({ series, segments }) =>
        segments.map((seg, i) => {
          const dx = seg.x2 - seg.x1;
          const dy = seg.y2 - seg.y1;
          const length = Math.sqrt(dx * dx + dy * dy);
          const thickness = seg.dashed ? Math.max((series.strokeWidth ?? 2) - 0.5, 1.2) : (series.strokeWidth ?? 2);
          return (
            <View
              key={`${series.key}-${i}`}
              style={{
                position: 'absolute',
                left: (seg.x1 + seg.x2) / 2 - (length + 1) / 2,
                top: (seg.y1 + seg.y2) / 2 - thickness / 2,
                width: length + 1,
                height: thickness,
                borderRadius: thickness / 2,
                backgroundColor: series.color,
                opacity: (seg.dashed ? (series.dashed ? 0.75 : 0.45) : 1) * seriesOpacity(series.key, active),
                transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
              }}
            />
          );
        }),
      )}
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  grid: { position: 'absolute', height: StyleSheet.hairlineWidth },
  yLabel: {
    position: 'absolute',
    right: 0,
    width: PAD.right - 8,
    textAlign: 'right',
    fontSize: 11,
    ...TABULAR,
  },
  xLabel: { position: 'absolute', fontSize: 11, ...TABULAR },
  marker: { position: 'absolute', width: 1, opacity: 0.35 },
  crosshair: { position: 'absolute', width: 1, opacity: 0.55 },
  dot: { position: 'absolute', width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  tooltip: { position: 'absolute', top: 0 },
});
