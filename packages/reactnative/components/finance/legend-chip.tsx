import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useFinancePalette } from '@/components/finance/ui';
import type { SeriesHighlight } from '@/hooks/use-series-highlight';

export type SwatchKind = 'line' | 'dashed' | 'square' | 'hollow' | 'step' | 'hatch';

/**
 * Tap to highlight (tap again to clear), long-press to hide or show, hover
 * on web to preview. `right` renders values beside the label.
 */
export function LegendChip({
  seriesKey,
  label,
  color,
  highlight,
  swatch = 'line',
  right,
  style,
}: {
  seriesKey: string;
  label: string;
  color: string;
  highlight: SeriesHighlight;
  swatch?: SwatchKind;
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = useFinancePalette();
  const hidden = highlight.hidden.has(seriesKey);
  const isActive = highlight.active === seriesKey;
  const dimmed = hidden || (highlight.active != null && !isActive);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: highlight.selected === seriesKey }}
      accessibilityHint={hidden ? 'Hidden. Long-press to show.' : 'Tap to highlight. Long-press to hide.'}
      onPress={() => highlight.toggle(seriesKey)}
      onLongPress={() => highlight.toggleHidden(seriesKey)}
      delayLongPress={450}
      onHoverIn={() => highlight.preview(seriesKey)}
      onHoverOut={() => highlight.preview(null)}
      hitSlop={4}
      style={[
        styles.chip,
        isActive && { backgroundColor: palette.chip },
        { opacity: dimmed ? 0.4 : 1 },
        Platform.OS === 'web' ? ({ cursor: 'pointer', userSelect: 'none' } as object) : null,
        style,
      ]}>
      <Swatch kind={hidden ? 'hollow' : swatch} color={color} />
      <Text
        numberOfLines={1}
        style={[
          styles.label,
          { color: isActive ? palette.text : palette.muted },
          isActive && styles.labelActive,
          hidden && styles.labelHidden,
        ]}>
        {label}
      </Text>
      {right}
    </Pressable>
  );
}

function Swatch({ kind, color }: { kind: SwatchKind; color: string }) {
  if (kind === 'square') return <View style={[styles.square, { backgroundColor: color }]} />;
  if (kind === 'hollow') return <View style={[styles.square, styles.hollow, { borderColor: color }]} />;
  if (kind === 'dashed') {
    return (
      <View style={styles.lineBox}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.dash, { backgroundColor: color }]} />
        ))}
      </View>
    );
  }
  if (kind === 'step') {
    return (
      <View style={styles.lineBox}>
        <View style={[styles.stepLow, { backgroundColor: color }]} />
        <View style={[styles.stepHigh, { backgroundColor: color }]} />
      </View>
    );
  }
  if (kind === 'hatch') {
    return (
      <View style={[styles.square, { overflow: 'hidden', backgroundColor: `${color}33` }]}>
        <View style={[styles.hatch, { backgroundColor: color }]} />
        <View style={[styles.hatch, styles.hatchTwo, { backgroundColor: color }]} />
      </View>
    );
  }
  return (
    <View style={styles.lineBox}>
      <View style={[styles.line, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginHorizontal: -6,
    borderRadius: 8,
  },
  label: { fontSize: 12, flexShrink: 1 },
  labelActive: { fontWeight: '700' },
  labelHidden: { textDecorationLine: 'line-through' },
  lineBox: { width: 16, height: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  line: { width: 16, height: 2.5, borderRadius: 2 },
  dash: { width: 4, height: 2, borderRadius: 1 },
  stepLow: { position: 'absolute', left: 0, bottom: 2, width: 8, height: 2, borderRadius: 1 },
  stepHigh: { position: 'absolute', right: 0, top: 2, width: 8, height: 2, borderRadius: 1 },
  hatch: { position: 'absolute', left: 2, top: -2, width: 1.5, height: 14, transform: [{ rotate: '20deg' }] },
  hatchTwo: { left: 6 },
  square: { width: 10, height: 10, borderRadius: 2 },
  hollow: { borderWidth: 2, backgroundColor: 'transparent' },
});
