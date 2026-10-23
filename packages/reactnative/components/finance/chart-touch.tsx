import * as Haptics from 'expo-haptics';
import { useCallback, useRef } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';

import { indexFromX } from '../../../server/convex/finance/benchmarks';

/**
 * Press-and-drag (hover on web) surface. Children never receive touches, so
 * `locationX` is always relative to this frame rather than a child line view.
 */
export function ChartTouch({
  count,
  padLeft = 0,
  padRight = 0,
  height,
  onScrub,
  onWidth,
  children,
}: {
  count: number;
  padLeft?: number;
  padRight?: number;
  height: number;
  onScrub: (index: number | null) => void;
  onWidth?: (width: number) => void;
  children: React.ReactNode;
}) {
  const widthRef = useRef(1);
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

  const grant = (event: GestureResponderEvent) => {
    emit(fromX(event.nativeEvent.locationX));
  };

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
            const x =
              clientX != null && rect ? clientX - rect.left : (event.nativeEvent?.offsetX ?? 0);
            emit(fromX(x));
          },
          onMouseLeave: () => emit(null),
        }
      : {};

  return (
    <View
      style={[styles.frame, { height }]}
      onLayout={onLayout}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={grant}
      onResponderMove={grant}
      onResponderRelease={() => emit(null)}
      onResponderTerminate={() => emit(null)}
      accessibilityHint="Press and drag to see values by day"
      {...webProps}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    ...(Platform.OS === 'web' ? ({ cursor: 'crosshair', userSelect: 'none' } as object) : null),
  },
});
