import { memo, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { ChartTooltip, type TooltipRow } from '@/components/finance/chart-tooltip';
import { ChartTouch } from '@/components/finance/chart-touch';
import { PointBadge } from '@/components/finance/compare-card';
import { Reveal } from '@/components/finance/reveal';
import { TABULAR, useFinancePalette, type FinancePalette } from '@/components/finance/ui';
import type { SeriesHighlight } from '@/hooks/use-series-highlight';
import type { ComparePair } from '@/lib/compare-math';
import { seriesOpacity } from '@/lib/series-highlight';
import {
  axisDateLabel,
  buildCurves,
  buildStepAfterCurves,
  curveAreaPath,
  curvesToPath,
  formatCompactUsd,
  niceTicks,
  sampleCurves,
  spanInDays,
  type Curve,
  type Segment,
} from '@/lib/chart-math';
import { formatCoverageDate } from '@/lib/finance-coverage';

export type ChartSeries = {
  key: string;
  label: string;
  color: string;
  values: Array<number | null>;
  /** Per-point interpolation flags; segments touching one are dashed. */
  gaps?: boolean[];
  dashed?: boolean;
  fill?: boolean;
  /** Hold the current y until the next x, then jump (cash-flow step). */
  stepAfter?: boolean;
  strokeWidth?: number;
  /** Draw a persistent dot on these indices (real, non-interpolated points). */
  dots?: boolean[];
};

export type ChartBand = {
  topKey: string;
  bottomKey: string;
  positiveColor: string;
  negativeColor: string;
};

type BandCol = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  color: string;
};

export type ChartMarker = { asOf: string; color: string };

const PAD = { top: 26, right: 56, bottom: 24, left: 2 };
const TAP_HIT_PX = 24;
/** Native draws curves as short rotated views; this caps views per chart. */
const NATIVE_SEGMENT_BUDGET = 640;
const FADE_BANDS = 10;

export function LineChart({
  dates,
  series,
  scrubIndex,
  onScrub,
  tooltipRows,
  tooltipMode = 'full',
  height = 220,
  includeZero = false,
  markers = [],
  highlight,
  renderCompare,
  bands = [],
  dimFlags,
}: {
  dates: string[];
  series: ChartSeries[];
  scrubIndex: number | null;
  onScrub: (index: number | null) => void;
  tooltipRows: (index: number) => TooltipRow[];
  /** `date` shows only a date pill; the caller renders values elsewhere. */
  tooltipMode?: 'full' | 'date';
  height?: number;
  includeZero?: boolean;
  markers?: ChartMarker[];
  /** Legend-driven emphasis; hidden series are dropped from the scale. */
  highlight?: SeriesHighlight;
  /** Enables two-point A/B compare; renders the summary under the chart. */
  renderCompare?: (pair: ComparePair, clear: () => void) => ReactNode;
  /** Shade the gap between two series (e.g. value vs net invested). */
  bands?: ChartBand[];
  /** Per-date hatch/dim for estimated or interpolated spans. */
  dimFlags?: boolean[];
}) {
  const palette = useFinancePalette();
  const [width, setWidth] = useState(0);
  const [compare, setCompare] = useState<ComparePair | null>(null);
  const count = dates.length;
  const active = highlight?.active ?? null;
  const hidden = highlight?.hidden;
  const visible = useMemo(() => {
    const shown = hidden && hidden.size > 0 ? series.filter((s) => !hidden.has(s.key)) : series;
    return active ? [...shown.filter((s) => s.key !== active), ...shown.filter((s) => s.key === active)] : shown;
  }, [active, hidden, series]);

  const geometry = useMemo<Geometry | null>(() => {
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
    const budget = Math.floor(NATIVE_SEGMENT_BUDGET / Math.max(visible.length, 1));
    const lines = visible.map((s) => {
      const curves = s.stepAfter
        ? buildStepAfterCurves(s.values, x, y, s.gaps, s.dashed)
        : buildCurves(s.values, x, y, s.gaps, s.dashed);
      return {
        series: s,
        curves,
        segments: Platform.OS === 'web' ? [] : sampleCurves(curves, budget),
      };
    });
    const byKey = new Map(visible.map((s) => [s.key, s] as const));
    const bandCols = bands.flatMap((band) => {
      const top = byKey.get(band.topKey);
      const bottom = byKey.get(band.bottomKey);
      if (!top || !bottom) return [];
      const cols: BandCol[] = [];
      for (let i = 0; i < count - 1; i += 1) {
        const t0 = top.values[i];
        const t1 = top.values[i + 1];
        const b0 = bottom.values[i];
        const b1 = bottom.values[i + 1];
        if (t0 == null || t1 == null || b0 == null || b1 == null) continue;
        const midTop = (t0 + t1) / 2;
        const midBottom = (b0 + b1) / 2;
        cols.push({
          left: x(i),
          right: x(i + 1),
          top: y(Math.max(midTop, midBottom)),
          bottom: y(Math.min(midTop, midBottom)),
          color: midTop >= midBottom ? band.positiveColor : band.negativeColor,
        });
      }
      return cols;
    });
    const dimCols: Array<{ left: number; right: number }> = [];
    if (dimFlags && dimFlags.length === count) {
      let i = 0;
      while (i < count) {
        if (!dimFlags[i]) {
          i += 1;
          continue;
        }
        const start = i;
        while (i < count && dimFlags[i]) i += 1;
        const end = Math.min(i, count - 1);
        dimCols.push({
          left: x(start),
          right: x(end === start ? Math.min(start + 1, count - 1) : end),
        });
      }
    }
    return { ticks, x, y, lines, bandCols, dimCols, baseline: PAD.top + innerH, innerH, width, height };
  }, [bands, count, dimFlags, height, includeZero, visible, width]);

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
  const xLabels = count > 1 ? [0, Math.round((count - 1) / 2), count - 1].filter((v, i, a) => a.indexOf(v) === i) : [];
  const hairX = geometry && scrubIndex != null ? geometry.x(scrubIndex) : null;
  const markerIndex = (asOf: string) => {
    let best = 0;
    dates.forEach((date, index) => {
      if (date <= asOf) best = index;
    });
    return best;
  };
  // Redraw (reveal) only when the data or the set of lines changes, not on highlight.
  const revealToken = `${dates[0]}|${dates[count - 1]}|${count}|${series.map((s) => s.key).join(',')}`;
  const native = Platform.OS !== 'web';
  useEffect(() => setCompare(null), [revealToken]);
  const pair = renderCompare && compare && compare.b < count ? compare : null;

  return (
    <View style={styles.wrap}>
      <ChartTouch
        count={count}
        padLeft={PAD.left}
        padRight={PAD.right}
        height={height}
        onScrub={onScrub}
        onWidth={setWidth}
        onTap={highlight ? onTap : undefined}
        compare={pair}
        onCompare={renderCompare ? setCompare : undefined}
      >
        {geometry ? (
          <>
            {native ? (
              <Reveal token={revealToken} width={width} height={height}>
                <NativeFill geometry={geometry} active={active} palette={palette} />
              </Reveal>
            ) : null}
            <Grid geometry={geometry} palette={palette} includeZero={includeZero} />
            <ProfitBands geometry={geometry} />
            <DimHatch geometry={geometry} palette={palette} />
            {pair ? (
              <View
                style={[
                  styles.compareBand,
                  {
                    left: geometry.x(pair.a),
                    width: Math.max(geometry.x(pair.b) - geometry.x(pair.a), 0),
                    top: PAD.top - 6,
                    height: geometry.innerH + 6,
                    backgroundColor: palette.accent,
                  },
                ]}
              />
            ) : null}
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
            <Reveal token={revealToken} width={width} height={height}>
              {native ? (
                <NativeLines geometry={geometry} active={active} />
              ) : (
                <WebLines geometry={geometry} active={active} />
              )}
            </Reveal>
            {geometry.lines.map(({ series: line }) =>
              line.dots?.map((on, index) => {
                if (!on) return null;
                const value = line.values[index];
                if (value == null) return null;
                return (
                  <View
                    key={`pt-${line.key}-${index}`}
                    style={{ opacity: seriesOpacity(line.key, active) }}
                  >
                    <View
                      style={[
                        styles.pointDot,
                        {
                          left: geometry.x(index) - POINT_DOT / 2,
                          top: geometry.y(value) - POINT_DOT / 2,
                          backgroundColor: line.color,
                          borderColor: palette.card,
                        },
                      ]}
                    />
                  </View>
                );
              }),
            )}
            {pair ? <CompareMarks geometry={geometry} pair={pair} palette={palette} active={active} /> : null}
            {hairX != null ? (
              <>
                <View
                  style={[
                    styles.dim,
                    {
                      left: hairX + 1,
                      width: Math.max(width - PAD.right - hairX - 1, 0),
                      top: PAD.top - 6,
                      height: geometry.innerH + 8,
                      backgroundColor: palette.card,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.crosshair,
                    {
                      left: hairX - 0.5,
                      top: PAD.top - 6,
                      height: geometry.innerH + 8,
                      backgroundColor: palette.crosshair,
                    },
                  ]}
                />
                {geometry.lines.map(({ series: s }) => {
                  const value = s.values[scrubIndex!];
                  if (value == null) return null;
                  const cy = geometry.y(value);
                  return (
                    <View key={`dot-${s.key}`} style={{ opacity: seriesOpacity(s.key, active) }}>
                      <View
                        style={[styles.halo, { left: hairX - HALO / 2, top: cy - HALO / 2, backgroundColor: s.color }]}
                      />
                      <View
                        style={[
                          styles.dot,
                          {
                            left: hairX - DOT / 2,
                            top: cy - DOT / 2,
                            backgroundColor: s.color,
                            borderColor: palette.card,
                          },
                        ]}
                      />
                    </View>
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
                  { color: palette.subtle, top: height - 16 },
                  i === 0
                    ? { left: PAD.left }
                    : i === xLabels.length - 1
                      ? { right: PAD.right - 6, textAlign: 'right' }
                      : { left: geometry.x(index) - 40, width: 80, textAlign: 'center' },
                ]}
              >
                {axisDateLabel(dates[index], span)}
              </Text>
            ))}
            {scrubIndex != null && hairX != null ? (
              tooltipMode === 'date' ? (
                <DatePill date={dates[scrubIndex]} x={hairX} width={width} palette={palette} />
              ) : (
                <ChartTooltip
                  date={dates[scrubIndex]}
                  rows={tooltipRows(scrubIndex).filter((row) => !row.key || !hidden?.has(row.key))}
                  highlightKey={active}
                  style={[
                    styles.tooltip,
                    hairX > width / 2 ? { right: width - hairX + 14 } : { left: hairX + 14 },
                    tooltipBounds(hairX, width),
                  ]}
                />
              )
            ) : null}
          </>
        ) : null}
      </ChartTouch>
      {pair && renderCompare ? renderCompare(pair, () => setCompare(null)) : null}
    </View>
  );
}

function CompareMarks({
  geometry,
  pair,
  palette,
  active,
}: {
  geometry: Geometry;
  pair: ComparePair;
  palette: FinancePalette;
  active: string | null;
}) {
  const ends: { label: 'A' | 'B'; index: number }[] =
    pair.a === pair.b
      ? [{ label: 'A', index: pair.a }]
      : [
          { label: 'A', index: pair.a },
          { label: 'B', index: pair.b },
        ];
  return (
    <>
      {ends.map(({ label, index }) => {
        const x = geometry.x(index);
        return (
          <View key={`cmp-${label}`} style={StyleSheet.absoluteFill}>
            <View
              style={[
                styles.compareLine,
                { left: x - 0.75, top: PAD.top - 6, height: geometry.innerH + 6, backgroundColor: palette.accent },
              ]}
            />
            {geometry.lines.map(({ series: s }) => {
              const value = s.values[index];
              if (value == null) return null;
              return (
                <View
                  key={`cmp-dot-${label}-${s.key}`}
                  style={[
                    styles.dot,
                    {
                      left: x - DOT / 2,
                      top: geometry.y(value) - DOT / 2,
                      backgroundColor: s.color,
                      borderColor: palette.card,
                      opacity: seriesOpacity(s.key, active),
                    },
                  ]}
                />
              );
            })}
            <View style={[styles.compareBadge, { left: x - 9, top: PAD.top - 24 }]}>
              <PointBadge label={label} color={palette.accent} />
            </View>
          </View>
        );
      })}
    </>
  );
}

const DOT = 10;
const POINT_DOT = 6;
const HALO = 24;
const PILL_W = 108;

function DatePill({ date, x, width, palette }: { date: string; x: number; width: number; palette: FinancePalette }) {
  const left = Math.min(Math.max(x - PILL_W / 2, 0), Math.max(width - PAD.right - PILL_W + 6, 0));
  return (
    <View
      pointerEvents="none"
      style={[
        styles.pill,
        { left, backgroundColor: palette.tooltip, shadowColor: palette.tooltipShadow, borderColor: palette.border },
      ]}
    >
      <Text style={[styles.pillText, { color: palette.text }]} numberOfLines={1}>
        {formatCoverageDate(date)}
      </Text>
    </View>
  );
}

function tooltipBounds(hairX: number, width: number) {
  const available = Math.max((hairX > width / 2 ? hairX : width - hairX) - 18, 140);
  return { maxWidth: Math.min(available, 280), minWidth: Math.min(190, available) };
}

type Geometry = {
  ticks: number[];
  lines: Array<{ series: ChartSeries; curves: Curve[]; segments: Segment[] }>;
  bandCols: BandCol[];
  dimCols: Array<{ left: number; right: number }>;
  x: (index: number) => number;
  y: (value: number) => number;
  baseline: number;
  innerH: number;
  width: number;
  height: number;
};

const ProfitBands = memo(function ProfitBands({ geometry }: { geometry: Geometry }) {
  if (geometry.bandCols.length === 0) return null;
  return (
    <>
      {geometry.bandCols.map((col, i) => (
        <View
          key={`band-${i}`}
          style={{
            position: 'absolute',
            left: col.left,
            width: Math.max(col.right - col.left, 0.5),
            top: col.top,
            height: Math.max(col.bottom - col.top, 0),
            backgroundColor: col.color,
            opacity: 0.22,
          }}
        />
      ))}
    </>
  );
});

const DimHatch = memo(function DimHatch({
  geometry,
  palette,
}: {
  geometry: Geometry;
  palette: FinancePalette;
}) {
  if (geometry.dimCols.length === 0) return null;
  return (
    <>
      {geometry.dimCols.map((col, i) => {
        const width = Math.max(col.right - col.left, 0);
        const stripes = Math.max(2, Math.floor(width / 5));
        return (
          <View
            key={`dim-${i}`}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: col.left,
              width,
              top: PAD.top,
              height: geometry.innerH,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                ...StyleSheet.absoluteFillObject,
                backgroundColor: palette.subtle,
                opacity: 0.1,
              }}
            />
            {Array.from({ length: stripes }, (_, s) => (
              <View
                key={`hatch-${i}-${s}`}
                style={{
                  position: 'absolute',
                  left: s * 5,
                  top: -4,
                  width: 1.5,
                  height: geometry.innerH + 8,
                  backgroundColor: palette.subtle,
                  opacity: 0.35,
                  transform: [{ rotate: '18deg' }],
                }}
              />
            ))}
          </View>
        );
      })}
    </>
  );
});

const Grid = memo(function Grid({
  geometry,
  palette,
  includeZero,
}: {
  geometry: Geometry;
  palette: FinancePalette;
  includeZero: boolean;
}) {
  return (
    <>
      {geometry.ticks.map((tick, i) => {
        const zero = includeZero && tick === 0;
        const edge = i === 0;
        return (
          <View key={`grid-${tick}`}>
            {zero || edge || i % 2 === 0 ? (
              <View
                style={[
                  styles.grid,
                  {
                    top: geometry.y(tick),
                    left: PAD.left,
                    right: PAD.right - 8,
                    backgroundColor: zero ? palette.border : palette.grid,
                  },
                ]}
              />
            ) : null}
            <Text style={[styles.yLabel, { top: geometry.y(tick) - 7, color: palette.subtle }]} numberOfLines={1}>
              {formatCompactUsd(tick)}
            </Text>
          </View>
        );
      })}
    </>
  );
});

const WebLines = memo(function WebLines({ geometry, active }: { geometry: Geometry; active: string | null }) {
  const gradientId = useMemo(() => `fill-${Math.random().toString(36).slice(2, 10)}`, []);
  const fillSeries = geometry.lines.find(({ series }) => series.fill);
  return (
    <svg
      width={geometry.width}
      height={geometry.height}
      style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}
    >
      {fillSeries ? (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={fillSeries.series.color} stopOpacity="0.34" />
              <stop offset="60%" stopColor={fillSeries.series.color} stopOpacity="0.1" />
              <stop offset="100%" stopColor={fillSeries.series.color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d={curveAreaPath(fillSeries.curves, geometry.baseline)}
            fill={`url(#${gradientId})`}
            fillOpacity={seriesOpacity(fillSeries.series.key, active)}
            stroke="none"
          />
        </>
      ) : null}
      {geometry.lines.map(({ series, curves }) => {
        const solid = curvesToPath(curves.filter((c) => !c.dashed));
        const dashed = curvesToPath(curves.filter((c) => c.dashed));
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
                strokeOpacity={series.dashed ? 0.9 : 0.75}
                strokeWidth={Math.max(strokeWidth - 0.2, 1.2)}
                strokeDasharray={series.dashed ? '5 4' : '6 3'}
                strokeLinecap="round"
              />
            ) : null}
          </g>
        );
      })}
    </svg>
  );
});

/**
 * Native has no SVG here (keeps OTA updates binary-compatible), so the area is
 * thin solid columns faded toward the baseline by card-colored bands.
 */
const NativeFill = memo(function NativeFill({
  geometry,
  active,
  palette,
}: {
  geometry: Geometry;
  active: string | null;
  palette: FinancePalette;
}): ReactNode {
  const fill = geometry.lines.find(({ series }) => series.fill);
  if (!fill || fill.segments.length === 0) return null;
  const opacity = seriesOpacity(fill.series.key, active);
  const top = Math.min(...fill.segments.map((seg) => Math.min(seg.y1, seg.y2)));
  const left = fill.segments[0].x1;
  const right = fill.segments[fill.segments.length - 1].x2;
  const bandH = Math.max(geometry.baseline - top, 0) / FADE_BANDS;
  return (
    <>
      {fill.segments.map((seg, i) => {
        const y = Math.min(seg.y1, seg.y2);
        return (
          <View
            key={`fill-${i}`}
            style={{
              position: 'absolute',
              left: seg.x1,
              width: Math.max(seg.x2 - seg.x1, 0.5) + 0.5,
              top: y,
              height: Math.max(geometry.baseline - y, 0),
              backgroundColor: fill.series.color,
              opacity: 0.2 * opacity,
            }}
          />
        );
      })}
      {Array.from({ length: FADE_BANDS }, (_, i) => (
        <View
          key={`fade-${i}`}
          style={{
            position: 'absolute',
            left,
            width: right - left + 1,
            top: top + i * bandH,
            height: bandH + 0.5,
            backgroundColor: palette.card,
            opacity: ((i + 1) / FADE_BANDS) * 0.92,
          }}
        />
      ))}
    </>
  );
});

const NativeLines = memo(function NativeLines({ geometry, active }: { geometry: Geometry; active: string | null }) {
  return (
    <>
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
                opacity: (seg.dashed ? (series.dashed ? 0.75 : 0.6) : 1) * seriesOpacity(series.key, active),
                transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
              }}
            />
          );
        }),
      )}
    </>
  );
});

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  grid: { position: 'absolute', height: StyleSheet.hairlineWidth },
  yLabel: {
    position: 'absolute',
    right: 0,
    width: PAD.right - 10,
    textAlign: 'right',
    fontSize: 11,
    fontWeight: '500',
    ...TABULAR,
  },
  xLabel: { position: 'absolute', fontSize: 11, fontWeight: '500', ...TABULAR },
  marker: { position: 'absolute', width: 1, opacity: 0.16 },
  dim: { position: 'absolute', opacity: 0.55 },
  compareBand: { position: 'absolute', opacity: 0.1, borderRadius: 4 },
  compareLine: { position: 'absolute', width: 1.5, opacity: 0.85 },
  compareBadge: { position: 'absolute' },
  crosshair: { position: 'absolute', width: 1, opacity: 0.5 },
  halo: { position: 'absolute', width: HALO, height: HALO, borderRadius: HALO / 2, opacity: 0.18 },
  dot: { position: 'absolute', width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: 2 },
  pointDot: { position: 'absolute', width: POINT_DOT, height: POINT_DOT, borderRadius: POINT_DOT / 2, borderWidth: 1.5 },
  tooltip: { position: 'absolute', top: 0 },
  pill: {
    position: 'absolute',
    top: 0,
    width: PILL_W,
    height: 20,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  pillText: { fontSize: 11, fontWeight: '600', ...TABULAR },
});
