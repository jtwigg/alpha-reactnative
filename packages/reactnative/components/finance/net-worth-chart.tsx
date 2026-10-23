import { Platform, StyleSheet, View } from 'react-native';

import { ChartTooltip, moneyAndPct } from '@/components/finance/chart-tooltip';
import { ChartTouch } from '@/components/finance/chart-touch';
import { ThemedText } from '@/components/themed-text';
import { classColor, classLabel, formatCoverageDate, formatUsd } from '@/lib/finance-coverage';
import type { ChartPoint, CoverageMarker } from '../../../server/convex/finance/series';

const WIDTH = 720;
const HEIGHT = 220;
const PAD = { top: 18, right: 16, bottom: 32, left: 64 };

export type BenchmarkLine = {
  label: string;
  color: string;
  values: Array<number | null>;
};

function scale(points: ChartPoint[], benchmark?: BenchmarkLine) {
  const extras = (benchmark?.values ?? []).filter((value): value is number => value != null);
  const ys = [...points.map((point) => point.total), ...extras];
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = maxY - minY || Math.max(Math.abs(maxY), 1);
  const pad = span * 0.08;
  const y0 = minY - pad;
  const y1 = maxY + pad;
  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  return {
    x: (index: number) => PAD.left + (index / Math.max(points.length - 1, 1)) * innerW,
    y: (value: number) => PAD.top + (1 - (value - y0) / (y1 - y0)) * innerH,
    y0,
    y1,
  };
}

function lineSegments(
  points: ChartPoint[],
  xy: ReturnType<typeof scale>,
  pick: (point: ChartPoint, index: number) => number | null,
) {
  const solid: string[] = [];
  const dashed: string[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const aVal = pick(points[i], i);
    const bVal = pick(points[i + 1], i + 1);
    if (aVal == null || bVal == null) continue;
    const a = `${xy.x(i).toFixed(1)},${xy.y(aVal).toFixed(1)}`;
    const b = `${xy.x(i + 1).toFixed(1)},${xy.y(bVal).toFixed(1)}`;
    const gap = points[i].interpolated || points[i + 1].interpolated;
    (gap ? dashed : solid).push(`M ${a} L ${b}`);
  }
  return { solid: solid.join(' '), dashed: dashed.join(' ') };
}

export function NetWorthChart({
  points,
  markers,
  scrubIndex,
  onScrub,
  benchmark,
}: {
  points: ChartPoint[];
  markers: CoverageMarker[];
  scrubIndex: number | null;
  onScrub: (index: number | null) => void;
  benchmark?: BenchmarkLine;
}) {
  if (points.length < 2) {
    return <ThemedText style={styles.empty}>Not enough history to chart yet.</ThemedText>;
  }
  const xy = scale(points, benchmark);
  const segs = lineSegments(points, xy, (point) => point.total);
  const benchSegs = benchmark
    ? lineSegments(points, xy, (_point, index) => benchmark.values[index] ?? null)
    : null;
  const first = points[0];
  const last = points[points.length - 1];
  const active = scrubIndex == null ? last : points[scrubIndex] ?? last;
  const benchValue =
    benchmark && scrubIndex != null ? benchmark.values[scrubIndex] : benchmark?.values[points.length - 1];
  const markerIndex = (asOf: string) => {
    let best = 0;
    points.forEach((point, index) => {
      if (point.asOf <= asOf) best = index;
    });
    return best;
  };
  const hairX = xy.x(scrubIndex ?? points.length - 1);

  return (
    <View style={styles.wrap}>
      {scrubIndex != null ? (
        <ChartTooltip
          date={active.asOf}
          rows={[
            {
              label: 'Net worth',
              value: moneyAndPct(active.total, first.total),
              color: '#0a7ea4',
              emphasis: true,
            },
            ...(benchmark && benchValue != null
              ? [
                  {
                    label: benchmark.label,
                    value: moneyAndPct(benchValue, benchmark.values[0] ?? benchValue),
                    color: benchmark.color,
                  },
                ]
              : []),
          ]}
        />
      ) : null}
      <ChartTouch
        count={points.length}
        padLeft={PAD.left}
        padRight={PAD.right}
        viewBoxWidth={WIDTH}
        height={HEIGHT}
        onScrub={onScrub}>
        {Platform.OS === 'web' ? (
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            width="100%"
            height={HEIGHT}
            preserveAspectRatio="none"
            style={{ width: '100%', height: HEIGHT, display: 'block' }}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={xy.y(0) < HEIGHT - PAD.bottom && xy.y(0) > PAD.top ? xy.y(0) : HEIGHT - PAD.bottom}
              y2={xy.y(0) < HEIGHT - PAD.bottom && xy.y(0) > PAD.top ? xy.y(0) : HEIGHT - PAD.bottom}
              stroke="#e6edf2"
              strokeWidth="1"
            />
            {markers.map((marker) => {
              const x = xy.x(markerIndex(marker.asOf));
              return (
                <line
                  key={`${marker.kind}-${marker.class}-${marker.asOf}`}
                  x1={x}
                  x2={x}
                  y1={PAD.top}
                  y2={HEIGHT - PAD.bottom}
                  stroke={classColor(marker.class)}
                  strokeOpacity="0.28"
                  strokeDasharray="2 3"
                />
              );
            })}
            {benchSegs?.solid ? (
              <path d={benchSegs.solid} fill="none" stroke={benchmark?.color} strokeWidth="1.8" strokeDasharray="4 3" />
            ) : null}
            {segs.solid ? (
              <path d={segs.solid} fill="none" stroke="#0a7ea4" strokeWidth="2.4" strokeLinecap="round" />
            ) : null}
            {segs.dashed ? (
              <path
                d={segs.dashed}
                fill="none"
                stroke="#7aa8b8"
                strokeWidth="2"
                strokeDasharray="5 4"
                strokeLinecap="round"
              />
            ) : null}
            {scrubIndex != null ? (
              <line
                x1={hairX}
                x2={hairX}
                y1={PAD.top}
                y2={HEIGHT - PAD.bottom}
                stroke="#11181C"
                strokeWidth="1.2"
              />
            ) : null}
            <text x={PAD.left} y={HEIGHT - 10} fontSize="12" fill="#687076">
              {formatCoverageDate(first.asOf)}
            </text>
            <text x={WIDTH - PAD.right} y={HEIGHT - 10} fontSize="12" fill="#687076" textAnchor="end">
              {formatCoverageDate(last.asOf)}
            </text>
            <text x={8} y={PAD.top + 6} fontSize="12" fill="#687076">
              {formatUsd(Math.max(...points.map((p) => p.total)))}
            </text>
            <text x={8} y={HEIGHT - PAD.bottom} fontSize="12" fill="#687076">
              {formatUsd(Math.min(...points.map((p) => p.total)))}
            </text>
          </svg>
        ) : (
          <NativeSparkline
            points={points}
            xy={xy}
            scrubIndex={scrubIndex}
            benchmark={benchmark}
          />
        )}
      </ChartTouch>
      <View style={styles.legend}>
        <LegendSwatch color="#0a7ea4" label="Net worth" />
        <LegendSwatch color="#7aa8b8" dashed label="Interpolated gap" />
        {benchmark ? <LegendSwatch color={benchmark.color} dashed label={benchmark.label} /> : null}
      </View>
      {markers.length > 0 ? (
        <View style={styles.markers}>
          {markers.map((marker) => (
            <ThemedText key={`${marker.class}-${marker.asOf}`} style={styles.marker}>
              {classLabel(marker.class)} from {formatCoverageDate(marker.asOf)}
            </ThemedText>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function NativeSparkline({
  points,
  xy,
  scrubIndex,
  benchmark,
}: {
  points: ChartPoint[];
  xy: ReturnType<typeof scale>;
  scrubIndex: number | null;
  benchmark?: BenchmarkLine;
}) {
  const last = Math.max(points.length - 1, 1);
  const leftPct = (PAD.left / WIDTH) * 100;
  const innerPct = ((WIDTH - PAD.left - PAD.right) / WIDTH) * 100;
  const xPct = (index: number) => leftPct + (index / last) * innerPct;
  return (
    <View style={styles.native}>
      {points.slice(0, -1).map((point, index) => {
        const next = points[index + 1];
        const y1 = xy.y(point.total);
        const y2 = xy.y(next.total);
        return (
          <View
            key={`${point.asOf}-${next.asOf}`}
            style={{
              position: 'absolute',
              left: `${xPct(index)}%`,
              width: `${innerPct / last}%`,
              top: Math.min(y1, y2),
              height: Math.max(Math.abs(y2 - y1), 2),
              backgroundColor: point.interpolated || next.interpolated ? '#9ec5e8' : '#0a7ea4',
              opacity: point.interpolated || next.interpolated ? 0.55 : 1,
              borderRadius: 1,
            }}
          />
        );
      })}
      {benchmark
        ? points.slice(0, -1).map((point, index) => {
            const a = benchmark.values[index];
            const b = benchmark.values[index + 1];
            if (a == null || b == null) return null;
            return (
              <View
                key={`bench-${point.asOf}`}
                style={{
                  position: 'absolute',
                  left: `${xPct(index)}%`,
                  width: `${innerPct / last}%`,
                  top: Math.min(xy.y(a), xy.y(b)),
                  height: Math.max(Math.abs(xy.y(b) - xy.y(a)), 2),
                  backgroundColor: benchmark.color,
                  opacity: 0.5,
                  borderRadius: 1,
                }}
              />
            );
          })
        : null}
      {scrubIndex != null ? (
        <View
          style={{
            position: 'absolute',
            left: `${xPct(scrubIndex)}%`,
            top: 0,
            width: 1,
            height: HEIGHT,
            backgroundColor: '#11181C',
          }}
        />
      ) : null}
    </View>
  );
}

function LegendSwatch({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <View style={styles.swatch}>
      <View style={[styles.swatchLine, { backgroundColor: color, opacity: dashed ? 0.55 : 1 }]} />
      <ThemedText style={styles.swatchLabel}>{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  native: { height: HEIGHT, width: '100%' },
  empty: { opacity: 0.7 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  swatch: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatchLine: { width: 18, height: 3, borderRadius: 2 },
  swatchLabel: { fontSize: 12, opacity: 0.75 },
  markers: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  marker: { fontSize: 11, opacity: 0.65 },
});
