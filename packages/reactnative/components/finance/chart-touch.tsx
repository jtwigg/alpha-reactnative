import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  PanResponder,
  Platform,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';

import { SCRUB_HOLD_MS, scrubIntent } from '@/lib/gesture-math';
import { indexFromX } from '../../../server/convex/finance/benchmarks';

const TAP_MS = 300;
const TAP_SLOP = 10;

type RawTouch = { pageX?: number; pageY?: number; locationX?: number; locationY?: number };

/** Native touch events carry page coords directly; react-native-web passes the DOM TouchEvent. */
function touchPoint(event: GestureResponderEvent) {
  const native = event.nativeEvent as RawTouch & {
    touches?: ArrayLike<RawTouch>;
    changedTouches?: ArrayLike<RawTouch>;
  };
  const touch = native.pageX != null ? native : (native.touches?.[0] ?? native.changedTouches?.[0] ?? native);
  const pageX = touch.pageX ?? 0;
  const pageY = touch.pageY ?? 0;
  if (native.locationX != null && native.locationY != null) {
    return { pageX, pageY, x: native.locationX, y: native.locationY };
  }
  const rect = (event.currentTarget as unknown as { getBoundingClientRect?: () => DOMRect })?.getBoundingClientRect?.();
  const scrollX = typeof window === 'undefined' ? 0 : window.scrollX;
  const scrollY = typeof window === 'undefined' ? 0 : window.scrollY;
  return {
    pageX,
    pageY,
    x: rect ? pageX - scrollX - rect.left : 0,
    y: rect ? pageY - scrollY - rect.top : 0,
  };
}

type Press = {
  t: number;
  x: number;
  y: number;
  pageX: number;
  pageY: number;
  moved: boolean;
  held: boolean;
  failed: boolean;
  claimed: boolean;
};

/**
 * Drag-to-scrub (hover on web) surface that lives inside the page ScrollView.
 * It only takes the touch for a horizontal drag or a deliberate hold, so
 * vertical pulls still scroll the page and trigger pull-to-refresh. Children
 * never receive touches, so `locationX` is always relative to this frame.
 */
export function ChartTouch({
  count,
  padLeft = 0,
  padRight = 0,
  height,
  onScrub,
  onWidth,
  onTap,
  children,
}: {
  count: number;
  padLeft?: number;
  padRight?: number;
  height: number;
  onScrub: (index: number | null) => void;
  onWidth?: (width: number) => void;
  /** Quick press without dragging; `y` is relative to this frame. */
  onTap?: (index: number, y: number) => void;
  children: React.ReactNode;
}) {
  const widthRef = useRef(1);
  const press = useRef<Press | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastIndex = useRef<number | null>(null);

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const width = event.nativeEvent.layout.width || 1;
      widthRef.current = width;
      onWidth?.(width);
    },
    [onWidth],
  );

  const emit = useCallback(
    (index: number | null) => {
      if (index !== null && index !== lastIndex.current && Platform.OS === 'ios') {
        void Haptics.selectionAsync().catch(() => undefined);
      }
      lastIndex.current = index;
      onScrub(index);
    },
    [onScrub],
  );

  const fromX = useCallback(
    (x: number) => indexFromX(x, widthRef.current, count, padLeft, padRight),
    [count, padLeft, padRight],
  );

  const latest = useRef({ emit, fromX, onTap });
  latest.current = { emit, fromX, onTap };

  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };
  useEffect(() => clearHold, []);

  const endPress = (cancelled: boolean) => {
    clearHold();
    const start = press.current;
    press.current = null;
    if (!start) return;
    const { onTap: tap, fromX: toIndex, emit: send } = latest.current;
    if (!cancelled && tap && !start.moved && !start.failed && Date.now() - start.t < TAP_MS) {
      tap(toIndex(start.x), start.y);
    }
    if (start.held || start.claimed || lastIndex.current !== null) send(null);
  };

  const onTouchStart = (event: GestureResponderEvent) => {
    const { x, y, pageX, pageY } = touchPoint(event);
    clearHold();
    press.current = {
      t: Date.now(),
      x,
      y,
      pageX,
      pageY,
      moved: false,
      held: false,
      failed: false,
      claimed: false,
    };
    holdTimer.current = setTimeout(() => {
      const current = press.current;
      if (!current || current.failed || current.moved) return;
      current.held = true;
      latest.current.emit(latest.current.fromX(current.x));
    }, SCRUB_HOLD_MS);
  };

  const onTouchMove = (event: GestureResponderEvent) => {
    const current = press.current;
    if (!current || current.claimed) return;
    const point = touchPoint(event);
    const dx = point.pageX - current.pageX;
    const dy = point.pageY - current.pageY;
    if (Math.hypot(dx, dy) > TAP_SLOP) current.moved = true;
    if (!current.held && scrubIntent(dx, dy) === 'fail') {
      current.failed = true;
      clearHold();
    }
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_event, gesture) => {
          const current = press.current;
          if (!current || current.failed) return false;
          const heldMs = current.held ? SCRUB_HOLD_MS : 0;
          return scrubIntent(gesture.dx, gesture.dy, heldMs) === 'claim';
        },
        onPanResponderGrant: (event) => {
          clearHold();
          if (press.current) {
            press.current.claimed = true;
            press.current.moved = true;
          }
          latest.current.emit(latest.current.fromX(event.nativeEvent.locationX));
        },
        onPanResponderMove: (event) => latest.current.emit(latest.current.fromX(event.nativeEvent.locationX)),
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: () => endPress(false),
        onPanResponderTerminate: () => endPress(true),
      }),
    // Handlers read refs, so one responder serves every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const webProps =
    Platform.OS === 'web'
      ? {
          onMouseMove: (event: {
            clientX?: number;
            nativeEvent?: { clientX?: number; offsetX?: number };
            currentTarget?: { getBoundingClientRect?: () => { left: number } };
          }) => {
            const clientX = event.nativeEvent?.clientX ?? event.clientX;
            const rect = event.currentTarget?.getBoundingClientRect?.();
            const x = clientX != null && rect ? clientX - rect.left : (event.nativeEvent?.offsetX ?? 0);
            emit(fromX(x));
          },
          onMouseLeave: () => emit(null),
        }
      : {};

  return (
    <View
      style={[styles.frame, { height }]}
      onLayout={onLayout}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={() => {
        if (!press.current?.claimed) endPress(false);
      }}
      onTouchCancel={() => {
        if (!press.current?.claimed) endPress(true);
      }}
      {...responder.panHandlers}
      accessibilityHint="Drag sideways or press and hold to see values by day"
      {...webProps}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    ...(Platform.OS === 'web' ? ({ cursor: 'crosshair', userSelect: 'none', touchAction: 'pan-y' } as object) : null),
  },
});
