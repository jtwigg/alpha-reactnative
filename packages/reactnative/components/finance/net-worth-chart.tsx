import { Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { classColor, classLabel, formatCoverageDate, formatUsd } from '@/lib/finance-coverage';
import type { ChartPoint, CoverageMarker } from '../../../server/convex/finance/series';

const WIDTH = 360;
const HEIGHT = 176;
const PAD = { top: 16, right: 10, bottom: 28, left: 52 };

function scale(points: ChartPoint[]) {
  const xs = points.map((point) => point.asOf);
  const ys = points.map((point) => point.total);
  const minX = 0;
  const maxX = Math.max(xs.length - 1, 1);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = maxY - minY || Math.max(Math.abs(maxY), 1);
  const pad = span * 0.08;
  const y0 = minY - pad;
  const y1 = maxY + pad;
  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  return {
    x: (index: number) => PAD.left + (index / maxX) * innerW,
    y: (value: number) => PAD.top + (1 - (value - y0) / (y1 - y0)) * innerH,
    minX,
    maxX,
    y0,
    y1,
  };
}

function lineSegments(points: ChartPoint[], xy: ReturnType<typeof scale>) {
  const solid: string[] = [];
  const dashed: string[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = `${xy.x(i).toFixed(1)},${xy.y(points[i].total).toFixed(1)}`;
    const b = `${xy.x(i + 1).toFixed(1)},${xy.y(points[i + 1].total).toFixed(1)}`;
    const gap = points[i].interpolated || points[i + 1].interpolated;
    (gap ? dashed : solid).push(`M ${a} L ${b}`);
  }
  return { solid: solid.join(' '), dashed: dashed.join(' ') };
}

function WebChart({
  points,
  markers,
}: {
  points: ChartPoint[];
  markers: CoverageMarker[];
}) {
  const xy = scale(points);
  const segs = lineSegments(points, xy);
  const first = points[0];
  const last = points[points.length - 1];
  const markerIndex = (asOf: string) => {
    let best = 0;
    points.forEach((point, index) => {
      if (point.asOf <= asOf) best = index;
    });
    return best;
  };

  return (
    <View style={styles.frame} accessibilityLabel="Net worth chart">
      {/* Web-only SVG. Native uses the sparkline fallback below. */}
      {Platform.OS === 'web' ? (
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height={HEIGHT}>
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
              <g key={`${marker.kind}-${marker.class}-${marker.asOf}`}>
                <line
                  x1={x}
                  x2={x}
                  y1={PAD.top}
                  y2={HEIGHT - PAD.bottom}
                  stroke={classColor(marker.class)}
                  strokeOpacity="0.28"
                  strokeDasharray="2 3"
                />
              </g>
            );
          })}
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
          <text x={PAD.left} y={HEIGHT - 8} fontSize="10" fill="#687076">
            {formatCoverageDate(first.asOf)}
          </text>
          <text x={WIDTH - PAD.right} y={HEIGHT - 8} fontSize="10" fill="#687076" textAnchor="end">
            {formatCoverageDate(last.asOf)}
          </text>
          <text x={4} y={PAD.top + 4} fontSize="10" fill="#687076">
            {formatUsd(Math.max(...points.map((p) => p.total)))}
          </text>
          <text x={4} y={HEIGHT - PAD.bottom} fontSize="10" fill="#687076">
            {formatUsd(Math.min(...points.map((p) => p.total)))}
          </text>
        </svg>
      ) : (
        <NativeSparkline points={points} />
      )}
    </View>
  );
}

function NativeSparkline({ points }: { points: ChartPoint[] }) {
  const xy = scale(points);
  return (
    <View style={styles.native}>
      {points.slice(0, -1).map((point, index) => {
        const next = points[index + 1];
        const x1 = xy.x(index);
        const x2 = xy.x(index + 1);
        const y1 = xy.y(point.total);
        const y2 = xy.y(next.total);
        const width = Math.max(x2 - x1, 1);
        const dashed = point.interpolated || next.interpolated;
        return (
          <View
            key={`${point.asOf}-${next.asOf}`}
            style={{
              position: 'absolute',
              left: x1,
              top: Math.min(y1, y2),
              width,
              height: Math.max(Math.abs(y2 - y1), 2),
              backgroundColor: dashed ? '#9ec5e8' : '#0a7ea4',
              opacity: dashed ? 0.55 : 1,
              borderRadius: 1,
            }}
          />
        );
      })}
    </View>
  );
}

export function NetWorthChart({
  points,
  markers,
}: {
  points: ChartPoint[];
  markers: CoverageMarker[];
}) {
  if (points.length < 2) {
    return <ThemedText style={styles.empty}>Not enough history to chart yet.</ThemedText>;
  }
  return (
    <View style={styles.wrap}>
      <WebChart points={points} markers={markers} />
      <View style={styles.legend}>
        <LegendSwatch color="#0a7ea4" label="Observed / manual" />
        <LegendSwatch color="#7aa8b8" dashed label="Interpolated gap" />
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
  frame: {
    borderWidth: 1,
    borderColor: '#d0d7de',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#f6f8fa',
  },
  native: { height: HEIGHT, width: '100%' },
  empty: { opacity: 0.7 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  swatch: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatchLine: { width: 18, height: 3, borderRadius: 2 },
  swatchLabel: { fontSize: 12, opacity: 0.75 },
  markers: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  marker: { fontSize: 11, opacity: 0.65 },
});
