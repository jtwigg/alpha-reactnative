import { useEffect, useRef, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';

const DURATION_MS = 520;

/**
 * Left-to-right draw-in plus fade whenever `token` changes (range, toggles).
 * Width is animated on the JS driver; it only runs for half a second per
 * change, and the clipped children are memoized so frames stay cheap.
 */
export function Reveal({
  token,
  width,
  height,
  children,
}: {
  token: string;
  width: number;
  height: number;
  children: ReactNode;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    progress.setValue(0);
    void AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) progress.setValue(1);
        else
          Animated.timing(progress, {
            toValue: 1,
            duration: DURATION_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }).start();
      });
    return () => {
      cancelled = true;
      progress.stopAnimation();
    };
  }, [progress, token]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        height,
        overflow: 'hidden',
        width: progress.interpolate({ inputRange: [0, 1], outputRange: [0, width + 8] }),
        opacity: progress.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0.2, 0.85, 1] }),
      }}>
      <View style={{ width, height }}>{children}</View>
    </Animated.View>
  );
}
