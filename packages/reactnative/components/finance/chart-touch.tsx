import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useId, useMemo, useRef } from 'react';
import {
  PanResponder,
  Platform,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';

import { useScrollLock } from '@/components/finance/scroll-lock';
import { nearestHandle, orderPair, type ComparePair } from '@/lib/compare-math';
import { SCRUB_HOLD_MS, scrubIntent } from '@/lib/gesture-math';
import { indexFromX } from '../../../server/convex/finance/benchmarks';

const TAP_MS = 300;
const TAP_SLOP = 10;
/** How close (px) a touch must land to a pinned crosshair to drag it. */
const HANDLE_HIT = 22;
/** Mouse travel before a press becomes a compare drag on web. */
const MOUSE_DRAG_PX = 4;
/** Browsers replay a touch as mouse events; ignore those. */
const COMPAT_MOUSE_MS = 800;

type RawTouch = {
  pageX?: number;
  pageY?: number;
  locationX?: number;
  locationY?: number;
  identifier?: string | number;
};

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

function activeTouches(event: GestureResponderEvent): RawTouch[] {
  return Array.from((event.nativeEvent as { touches?: ArrayLike<RawTouch> }).touches ?? []);
}

type MouseLike = {
  button?: number;
  shiftKey?: boolean;
  clientX?: number;
  clientY?: number;
  nativeEvent?: { clientX?: number; clientY?: number; offsetX?: number; offsetY?: number; shiftKey?: boolean };
  currentTarget?: { getBoundingClientRect?: () => { left: number; top: number } };
  preventDefault?: () => void;
};

function mousePoint(event: MouseLike) {
  const clientX = event.nativeEvent?.clientX ?? event.clientX;
  const clientY = event.nativeEvent?.clientY ?? event.clientY;
  const rect = event.currentTarget?.getBoundingClientRect?.();
  return {
    x: clientX != null && rect ? clientX - rect.left : (event.nativeEvent?.offsetX ?? 0),
    y: clientY != null && rect ? clientY - rect.top : (event.nativeEvent?.offsetY ?? 0),
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
  /** Pinned crosshair under the finger, dragged instead of scrubbing. */
  handle: 'a' | 'b' | null;
};

type Gesture =
  | { kind: 'scrub' }
  | { kind: 'handle'; fixed: number }
  | { kind: 'compare'; slots: { id: string | number | null; index: number }[] };

type MouseDrag = { x: number; index: number; moved: boolean; fixed: number | null };

/**
 * Chart gesture surface inside the page ScrollView.
 *
 * - One finger: drag sideways (or press and hold) to scrub. Vertical pulls
 *   still scroll the page and trigger pull-to-refresh.
 * - Two fingers (when `onCompare` is set): place crosshairs A and B; each
 *   finger drags its own point. The pair stays pinned after lifting; drag a
 *   pinned crosshair to move it, tap the chart to clear.
 * - Web: hover scrubs, click-drag compares, shift-click sets/moves a point.
 *
 * Children never receive touches, so `locationX` is relative to this frame.
 */
export function ChartTouch({
  count,
  padLeft = 0,
  padRight = 0,
  height,
  onScrub,
  onWidth,
  onTap,
  compare = null,
  onCompare,
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
  /** Pinned A/B pair, owned by the chart. */
  compare?: ComparePair | null;
  onCompare?: (pair: ComparePair | null) => void;
  children: React.ReactNode;
}) {
  const widthRef = useRef(1);
  const press = useRef<Press | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastIndex = useRef<number | null>(null);
  const lastPair = useRef<ComparePair | null>(null);
  const mouse = useRef<MouseDrag | null>(null);
  const lastTouchEnd = useRef(0);
  const lockScroll = useScrollLock();
  const lockId = useId();

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

  const emitCompare = useCallback(
    (pair: ComparePair | null) => {
      const prev = lastPair.current;
      if (pair && (!prev || prev.a !== pair.a || prev.b !== pair.b) && Platform.OS === 'ios') {
        void Haptics.selectionAsync().catch(() => undefined);
      }
      lastPair.current = pair;
      onCompare?.(pair);
    },
    [onCompare],
  );

  const fromX = useCallback(
    (x: number) => indexFromX(x, widthRef.current, count, padLeft, padRight),
    [count, padLeft, padRight],
  );
  const xOf = useCallback(
    (index: number) => {
      const inner = Math.max(widthRef.current - padLeft - padRight, 1);
      return padLeft + (count > 1 ? (index / (count - 1)) * inner : 0);
    },
    [count, padLeft, padRight],
  );

  const latest = useRef({ emit, emitCompare, fromX, xOf, onTap, compare, canCompare: Boolean(onCompare) });
  latest.current = { emit, emitCompare, fromX, xOf, onTap, compare, canCompare: Boolean(onCompare) };
  useEffect(() => {
    lastPair.current = compare;
  }, [compare]);

  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };
  useEffect(() => clearHold, []);
  useEffect(() => () => lockScroll(lockId, false), [lockId, lockScroll]);

  const endPress = (cancelled: boolean) => {
    clearHold();
    const start = press.current;
    press.current = null;
    if (!start) return;
    const { onTap: tap, fromX: toIndex, emit: send, compare: pinned, emitCompare: setPair } = latest.current;
    if (!cancelled && !start.moved && !start.failed && Date.now() - start.t < TAP_MS) {
      if (pinned) setPair(null);
      else tap?.(toIndex(start.x), start.y);
    }
    if (start.held || start.claimed || lastIndex.current !== null) send(null);
  };

  const onTouchStart = (event: GestureResponderEvent) => {
    if (press.current && activeTouches(event).length > 1) return;
    const { x, y, pageX, pageY } = touchPoint(event);
    clearHold();
    const { compare: pinned, canCompare, xOf: toX } = latest.current;
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
      handle: pinned && canCompare ? nearestHandle(x, { a: toX(pinned.a), b: toX(pinned.b) }, HANDLE_HIT) : null,
    };
    holdTimer.current = setTimeout(() => {
      const current = press.current;
      if (!current || current.failed || current.moved) return;
      current.held = true;
      if (!current.handle) latest.current.emit(latest.current.fromX(current.x));
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

  const responder = useMemo(() => {
    const frameIndex = (event: GestureResponderEvent, touch: RawTouch) => {
      const offset = (event.nativeEvent.pageX ?? 0) - (event.nativeEvent.locationX ?? 0);
      return latest.current.fromX((touch.pageX ?? 0) - offset);
    };

    const startCompare = (event: GestureResponderEvent) => {
      const touches = activeTouches(event).slice(0, 2);
      gesture.current = {
        kind: 'compare',
        slots: touches.map((touch) => ({ id: touch.identifier ?? null, index: frameIndex(event, touch) })),
      };
      latest.current.emit(null);
      if (Platform.OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    };

    const moveCompare = (event: GestureResponderEvent) => {
      const g = gesture.current;
      if (g?.kind !== 'compare') return;
      const touches = activeTouches(event);
      const ids = new Set(touches.map((touch) => touch.identifier ?? null));
      for (const touch of touches) {
        const id = touch.identifier ?? null;
        let slot = g.slots.find((s) => s.id === id);
        // A finger that lifted hands its point to the next finger that lands.
        if (!slot) slot = g.slots.find((s) => !ids.has(s.id));
        if (!slot) continue;
        slot.id = id;
        slot.index = frameIndex(event, touch);
      }
      const [first, second] = g.slots;
      if (first && second) latest.current.emitCompare(orderPair(first.index, second.index));
    };

    const multi = (event: GestureResponderEvent) => latest.current.canCompare && activeTouches(event).length >= 2;

    const finish = (cancelled: boolean) => {
      lockScroll(lockId, false);
      const g = gesture.current;
      gesture.current = null;
      if (g?.kind === 'scrub' || g == null) {
        endPress(cancelled);
        return;
      }
      clearHold();
      press.current = null;
      if (Platform.OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    };

    return PanResponder.create({
      onStartShouldSetPanResponder: (event) => multi(event),
      onMoveShouldSetPanResponder: (event, state) => {
        if (multi(event)) return true;
        const current = press.current;
        if (!current || current.failed) return false;
        const heldMs = current.held ? SCRUB_HOLD_MS : 0;
        return scrubIntent(state.dx, state.dy, heldMs) === 'claim';
      },
      onPanResponderGrant: (event) => {
        clearHold();
        lockScroll(lockId, true);
        const current = press.current;
        if (current) {
          current.claimed = true;
          current.moved = true;
        }
        const pinned = latest.current.compare;
        if (multi(event)) {
          startCompare(event);
          moveCompare(event);
        } else if (current?.handle && pinned) {
          gesture.current = { kind: 'handle', fixed: current.handle === 'a' ? pinned.b : pinned.a };
          latest.current.emit(null);
          latest.current.emitCompare(
            orderPair(gesture.current.fixed, latest.current.fromX(event.nativeEvent.locationX)),
          );
        } else {
          gesture.current = { kind: 'scrub' };
          latest.current.emit(latest.current.fromX(event.nativeEvent.locationX));
        }
      },
      onPanResponderMove: (event) => {
        const g = gesture.current;
        if (multi(event) && g?.kind !== 'compare') startCompare(event);
        const next = gesture.current;
        if (next?.kind === 'compare') moveCompare(event);
        else if (next?.kind === 'handle') {
          latest.current.emitCompare(orderPair(next.fixed, latest.current.fromX(event.nativeEvent.locationX)));
        } else latest.current.emit(latest.current.fromX(event.nativeEvent.locationX));
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (event) => {
        // Lifting one of two fingers keeps the gesture alive for the other.
        if (gesture.current?.kind === 'compare' && activeTouches(event).length > 0) return;
        finish(false);
      },
      onPanResponderTerminate: () => finish(true),
    });
    // Handlers read refs, so one responder serves every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const webProps =
    Platform.OS === 'web'
      ? {
          onMouseDown: (event: MouseLike) => {
            if ((event.button ?? 0) !== 0 || Date.now() - lastTouchEnd.current < COMPAT_MOUSE_MS) return;
            const { x } = mousePoint(event);
            const pinned = latest.current.compare;
            const handle =
              pinned && onCompare ? nearestHandle(x, { a: xOf(pinned.a), b: xOf(pinned.b) }, HANDLE_HIT) : null;
            mouse.current = {
              x,
              index: fromX(x),
              moved: false,
              fixed: handle && pinned ? (handle === 'a' ? pinned.b : pinned.a) : null,
            };
          },
          onMouseMove: (event: MouseLike) => {
            const { x } = mousePoint(event);
            const drag = mouse.current;
            if (drag && onCompare) {
              if (!drag.moved && Math.abs(x - drag.x) > MOUSE_DRAG_PX) {
                drag.moved = true;
                emit(null);
              }
              if (drag.moved) {
                emitCompare(orderPair(drag.fixed ?? drag.index, fromX(x)));
                return;
              }
            }
            emit(fromX(x));
          },
          onMouseUp: (event: MouseLike) => {
            const drag = mouse.current;
            mouse.current = null;
            if (!drag || drag.moved) return;
            const { x, y } = mousePoint(event);
            const index = fromX(x);
            const pinned = latest.current.compare;
            const shift = event.shiftKey ?? event.nativeEvent?.shiftKey ?? false;
            if (shift && onCompare) {
              if (!pinned) emitCompare({ a: index, b: index });
              else if (pinned.a === pinned.b) emitCompare(orderPair(pinned.a, index));
              else {
                const moveA = Math.abs(index - pinned.a) <= Math.abs(index - pinned.b);
                emitCompare(orderPair(moveA ? pinned.b : pinned.a, index));
              }
              return;
            }
            if (pinned) emitCompare(null);
            else onTap?.(index, y);
          },
          onMouseLeave: () => {
            mouse.current = null;
            emit(null);
          },
        }
      : {};

  return (
    <View
      style={[styles.frame, { height }]}
      onLayout={onLayout}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={(event) => {
        lastTouchEnd.current = Date.now();
        if (activeTouches(event).length > 0) return;
        if (!press.current?.claimed) endPress(false);
      }}
      onTouchCancel={() => {
        if (!press.current?.claimed) endPress(true);
      }}
      {...responder.panHandlers}
      accessibilityHint={
        onCompare
          ? 'Drag sideways to see values by day. Use two fingers to compare two dates.'
          : 'Drag sideways or press and hold to see values by day'
      }
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
