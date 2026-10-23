import { useCallback, useRef } from 'react';
import { Platform, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';

import { indexFromX } from '../../../server/convex/finance/benchmarks';

export function ChartTouch({
  count,
  padLeft = 0,
  padRight = 0,
  viewBoxWidth,
  height,
  onScrub,
  children,
}: {
  count: number;
  padLeft?: number;
  padRight?: number;
  /** When set, pads are in viewBox units and scale to the laid-out width. */
  viewBoxWidth?: number;
  height: number;
  onScrub: (index: number | null) => void;
  children: React.ReactNode;
}) {
  const widthRef = useRef(1);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    widthRef.current = event.nativeEvent.layout.width || 1;
  }, []);

  const fromX = useCallback(
    (x: number) => {
      const width = widthRef.current;
      const scale = viewBoxWidth && viewBoxWidth > 0 ? width / viewBoxWidth : 1;
      return indexFromX(x, width, count, padLeft * scale, padRight * scale);
    },
    [count, padLeft, padRight, viewBoxWidth],
  );

  const grant = (event: GestureResponderEvent) => {
    onScrub(fromX(event.nativeEvent.locationX));
  };

  const webProps =
    Platform.OS === 'web'
      ? {
          onMouseMove: (event: { nativeEvent?: { offsetX?: number; locationX?: number } }) => {
            const x = event.nativeEvent?.offsetX ?? event.nativeEvent?.locationX ?? 0;
            onScrub(fromX(x));
          },
          onMouseLeave: () => onScrub(null),
        }
      : {};

  return (
    <View
      style={[styles.frame, { minHeight: height }]}
      onLayout={onLayout}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={grant}
      onResponderMove={grant}
      onResponderRelease={() => onScrub(null)}
      onResponderTerminate={() => onScrub(null)}
      {...webProps}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderWidth: 1,
    borderColor: '#d0d7de',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#f6f8fa',
    width: '100%',
  },
});
