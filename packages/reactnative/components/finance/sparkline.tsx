import { useMemo } from 'react';
import { Platform, View } from 'react-native';

import { areaPath, buildSegments, segmentsToPath } from '@/lib/chart-math';

const INSET = 2;

export function Sparkline({
  values,
  color,
  width = 72,
  height = 28,
  label,
}: {
  values: (number | null)[];
  color: string;
  width?: number;
  height?: number;
  label?: string;
}) {
  const geometry = useMemo(() => {
    const firstKnown = values.findIndex((value) => value != null);
    const covered = firstKnown < 0 ? [] : values.slice(firstKnown);
    const known = covered.filter((value): value is number => value != null);
    if (known.length < 2) return null;
    const min = Math.min(...known);
    const max = Math.max(...known);
    const span = max - min;
    const innerH = height - INSET * 2;
    const x = (index: number) => INSET + (index * (width - INSET * 2)) / Math.max(covered.length - 1, 1);
    const y = (value: number) => (span === 0 ? height / 2 : INSET + innerH - ((value - min) / span) * innerH);
    const lastIndex = covered.reduce<number>((acc, value, index) => (value != null ? index : acc), -1);
    return {
      covered,
      x,
      y,
      segments: buildSegments(covered, x, y),
      end: { x: x(lastIndex), y: y(covered[lastIndex] as number) },
    };
  }, [height, values, width]);

  return (
    <View
      style={{ width, height }}
      accessible={Boolean(label)}
      accessibilityLabel={label}
      pointerEvents="none">
      {geometry == null ? (
        <View
          style={{
            position: 'absolute',
            left: INSET,
            right: INSET,
            top: height / 2,
            height: 1,
            backgroundColor: color,
            opacity: 0.3,
          }}
        />
      ) : Platform.OS === 'web' ? (
        <svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
          <path d={areaPath(geometry.covered, geometry.x, geometry.y, height)} fill={color} fillOpacity={0.1} stroke="none" />
          <path
            d={segmentsToPath(geometry.segments)}
            fill="none"
            stroke={color}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx={geometry.end.x} cy={geometry.end.y} r={2.2} fill={color} />
        </svg>
      ) : (
        <>
          {geometry.segments.map((seg, i) => {
            const dx = seg.x2 - seg.x1;
            const dy = seg.y2 - seg.y1;
            const length = Math.sqrt(dx * dx + dy * dy);
            return (
              <View
                key={i}
                style={{
                  position: 'absolute',
                  left: (seg.x1 + seg.x2) / 2 - (length + 0.6) / 2,
                  top: (seg.y1 + seg.y2) / 2 - 0.8,
                  width: length + 0.6,
                  height: 1.6,
                  borderRadius: 0.8,
                  backgroundColor: color,
                  transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
                }}
              />
            );
          })}
          <View
            style={{
              position: 'absolute',
              left: geometry.end.x - 2.2,
              top: geometry.end.y - 2.2,
              width: 4.4,
              height: 4.4,
              borderRadius: 2.2,
              backgroundColor: color,
            }}
          />
        </>
      )}
    </View>
  );
}
