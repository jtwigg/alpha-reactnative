import { useRef, useState } from 'react';
import { PanResponder, Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { Sparkline } from '@/components/finance/sparkline';
import { FText, useFinancePalette } from '@/components/finance/ui';
import { axisDateLabel, spanInDays } from '@/lib/chart-math';
import { dragWindow } from '@/lib/stack-math';

const HEIGHT = 46;
const HANDLE_HIT = 28;

type Part = 'start' | 'end' | 'body';

/**
 * Overview strip with a draggable zoom window. `onChange` fires while
 * dragging (cheap preview); `onCommit` fires on release.
 */
export function RangeNavigator({
  dates,
  values,
  start,
  end,
  onChange,
  onCommit,
  color,
}: {
  dates: string[];
  values: (number | null)[];
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
  onCommit: (start: number, end: number) => void;
  color: string;
}) {
  const palette = useFinancePalette();
  const [width, setWidth] = useState(0);
  const count = dates.length;
  const latest = useRef({ start, end, width, count, onChange, onCommit });
  latest.current = { start, end, width, count, onChange, onCommit };
  const origin = useRef({ start, end });
  const pending = useRef<[number, number]>([start, end]);

  const responder = (part: Part) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        origin.current = { start: latest.current.start, end: latest.current.end };
        pending.current = [latest.current.start, latest.current.end];
      },
      onPanResponderMove: (_event, gesture) => {
        const { width: w, count: n } = latest.current;
        if (w <= 0 || n < 2) return;
        const delta = Math.round((gesture.dx / w) * (n - 1));
        const next = dragWindow(origin.current.start, origin.current.end, part, delta, n);
        if (next[0] !== pending.current[0] || next[1] !== pending.current[1]) {
          pending.current = next;
          latest.current.onChange(next[0], next[1]);
        }
      },
      onPanResponderRelease: () => latest.current.onCommit(pending.current[0], pending.current[1]),
      onPanResponderTerminate: () => latest.current.onCommit(pending.current[0], pending.current[1]),
    });

  const handlers = useRef({ start: responder('start'), end: responder('end'), body: responder('body') }).current;

  const x = (index: number) => (count > 1 ? (index / (count - 1)) * width : 0);
  const left = x(start);
  const right = x(end);
  const span = count > 1 ? spanInDays(dates[0], dates[count - 1]) : 0;
  const webCursor = (cursor: string) => (Platform.OS === 'web' ? ({ cursor } as object) : null);

  return (
    <View style={styles.wrap}>
      <View
        style={[styles.track, { backgroundColor: palette.cardAlt, borderColor: palette.border }]}
        onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
        accessibilityLabel={`Zoom window ${dates[start] ?? ''} to ${dates[end] ?? ''}`}>
        {width > 0 ? (
          <>
            <View style={styles.spark} pointerEvents="none">
              <Sparkline values={values} color={color} width={width} height={HEIGHT - 8} />
            </View>
            <View pointerEvents="none" style={[styles.mask, { left: 0, width: left, backgroundColor: palette.page }]} />
            <View
              pointerEvents="none"
              style={[styles.mask, { left: right, right: 0, backgroundColor: palette.page }]}
            />
            <View
              {...handlers.body.panHandlers}
              style={[
                styles.window,
                { left, width: Math.max(right - left, 2), borderColor: palette.accent },
                webCursor('grab'),
              ]}
            />
            {(['start', 'end'] as const).map((part) => (
              <View
                key={part}
                {...handlers[part].panHandlers}
                accessibilityRole="adjustable"
                accessibilityLabel={part === 'start' ? 'Window start' : 'Window end'}
                hitSlop={{ top: 8, bottom: 8 }}
                style={[styles.handleHit, { left: (part === 'start' ? left : right) - HANDLE_HIT / 2 }, webCursor('ew-resize')]}>
                <View style={[styles.handle, { backgroundColor: palette.card, borderColor: palette.accent }]}>
                  <View style={[styles.grip, { backgroundColor: palette.accent }]} />
                  <View style={[styles.grip, { backgroundColor: palette.accent }]} />
                </View>
              </View>
            ))}
          </>
        ) : null}
      </View>
      {count > 1 ? (
        <View style={styles.labels}>
          <FText variant="caption" tone="subtle">
            {axisDateLabel(dates[0], span)}
          </FText>
          <FText variant="caption" tone="subtle">
            {axisDateLabel(dates[count - 1], span)}
          </FText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4, paddingHorizontal: HANDLE_HIT / 2 },
  track: {
    height: HEIGHT,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    ...(Platform.OS === 'web' ? ({ userSelect: 'none', touchAction: 'none' } as object) : null),
  },
  spark: { position: 'absolute', left: 0, top: 4 },
  mask: { position: 'absolute', top: 0, bottom: 0, opacity: 0.6 },
  window: {
    position: 'absolute',
    top: -1,
    bottom: -1,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    backgroundColor: 'transparent',
  },
  handleHit: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: HANDLE_HIT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: 12,
    height: 30,
    borderRadius: 4,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  grip: { width: 1.5, height: 12, borderRadius: 1 },
  labels: { flexDirection: 'row', justifyContent: 'space-between' },
});
