import { Platform, StyleSheet, View } from 'react-native';

import { ChartTooltip, classRows } from '@/components/finance/chart-tooltip';
import { ChartTouch } from '@/components/finance/chart-touch';
import { ThemedText } from '@/components/themed-text';
import { classColor, classLabel } from '@/lib/finance-coverage';
import type { ChartPoint } from '../../../server/convex/finance/series';

const WIDTH = 720;
const HEIGHT = 200;
const PAD = { top: 16, right: 16, bottom: 24, left: 16 };

export function ClassChart({
  points,
  scrubIndex,
  onScrub,
}: {
  points: ChartPoint[];
  scrubIndex: number | null;
  onScrub: (index: number | null) => void;
}) {
  const classes = Array.from(
    new Set(points.flatMap((point) => Object.keys(point.byClass))),
  ).sort();
  if (points.length < 2 || classes.length === 0) return null;

  const values = points.flatMap((point) =>
    classes.map((className) => point.byClass[className]).filter((value) => value !== undefined),
  );
  const minY = Math.min(0, ...values);
  const maxY = Math.max(...values);
  const span = maxY - minY || 1;
  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const x = (index: number) => PAD.left + (index / Math.max(points.length - 1, 1)) * innerW;
  const y = (value: number) => PAD.top + (1 - (value - minY) / span) * innerH;

  const paths = classes.map((className) => {
    const solid: string[] = [];
    const dashed: string[] = [];
    for (let i = 0; i < points.length; i += 1) {
      if (points[i].byClass[className] === undefined) continue;
      const nextDefined =
        i < points.length - 1 && points[i + 1].byClass[className] !== undefined;
      if (!nextDefined) continue;
      const a = `${x(i).toFixed(1)},${y(points[i].byClass[className]).toFixed(1)}`;
      const b = `${x(i + 1).toFixed(1)},${y(points[i + 1].byClass[className]).toFixed(1)}`;
      const gap = points[i].interpolated || points[i + 1].interpolated;
      (gap ? dashed : solid).push(`M ${a} L ${b}`);
    }
    return { className, solid: solid.join(' '), dashed: dashed.join(' ') };
  });

  const active = scrubIndex == null ? null : points[scrubIndex];
  const hairX = x(scrubIndex ?? 0);

  return (
    <View style={styles.wrap}>
      <ThemedText type="defaultSemiBold">By class</ThemedText>
      <ThemedText style={styles.hint}>
        A class line starts on its first data point. Missing early history is
        omitted, not drawn as $0. Press and drag (hover on web) for a day.
      </ThemedText>
      {active ? <ChartTooltip date={active.asOf} rows={classRows(active.byClass)} /> : null}
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
            {paths.map((path) => (
              <g key={path.className}>
                {path.solid ? (
                  <path
                    d={path.solid}
                    fill="none"
                    stroke={classColor(path.className)}
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                ) : null}
                {path.dashed ? (
                  <path
                    d={path.dashed}
                    fill="none"
                    stroke={classColor(path.className)}
                    strokeWidth="1.6"
                    strokeDasharray="5 4"
                    strokeOpacity="0.55"
                    strokeLinecap="round"
                  />
                ) : null}
              </g>
            ))}
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
          </svg>
        ) : (
          <View style={{ height: HEIGHT }}>
            {scrubIndex != null ? (
              <View
                style={{
                  position: 'absolute',
                  left: `${((PAD.left + (scrubIndex / Math.max(points.length - 1, 1)) * (WIDTH - PAD.left - PAD.right)) / WIDTH) * 100}%`,
                  top: 0,
                  bottom: 0,
                  width: 1,
                  backgroundColor: '#11181C',
                }}
              />
            ) : null}
          </View>
        )}
      </ChartTouch>
      <View style={styles.legend}>
        {classes.map((className) => (
          <View key={className} style={styles.swatch}>
            <View style={[styles.dot, { backgroundColor: classColor(className) }]} />
            <ThemedText style={styles.label}>{classLabel(className)}</ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  hint: { fontSize: 13, opacity: 0.7, lineHeight: 18 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { fontSize: 12, opacity: 0.75 },
});
