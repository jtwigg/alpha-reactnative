import type { ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { formatPct, formatUsdSigned } from '@/lib/finance-coverage';

const LIGHT = {
  page: '#F4F5F7',
  card: '#FFFFFF',
  cardAlt: '#F8F9FB',
  border: '#E3E6EA',
  hairline: '#ECEEF1',
  text: '#0F1419',
  muted: '#5B6670',
  subtle: '#8A949E',
  accent: '#0A7EA4',
  accentSoft: '#E3F2F8',
  positive: '#15803D',
  positiveSoft: '#E6F4EA',
  negative: '#C2362F',
  negativeSoft: '#FCE9E7',
  chip: '#EEF1F4',
  pressed: '#F1F3F5',
  grid: '#EDEFF2',
  crosshair: '#0F1419',
  tooltip: '#FFFFFF',
  shadow: 'rgba(15, 20, 25, 0.06)',
};

export type FinancePalette = typeof LIGHT;

const DARK: FinancePalette = {
  page: '#0C0E10',
  card: '#16191C',
  cardAlt: '#1B1F23',
  border: '#262B30',
  hairline: '#22272B',
  text: '#ECEDEE',
  muted: '#A0A7AD',
  subtle: '#6F7880',
  accent: '#3AB4DA',
  accentSoft: '#12303B',
  positive: '#3FB950',
  positiveSoft: '#14301C',
  negative: '#F2665C',
  negativeSoft: '#3A1A18',
  chip: '#22272B',
  pressed: '#1F2428',
  grid: '#22272B',
  crosshair: '#ECEDEE',
  tooltip: '#1F2428',
  shadow: 'rgba(0, 0, 0, 0.4)',
};

export function useFinancePalette(): FinancePalette {
  return useColorScheme() === 'dark' ? DARK : LIGHT;
}

export const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

export const MAX_CONTENT_WIDTH = 960;

export function FText({
  children,
  style,
  tone = 'text',
  variant = 'body',
  numberOfLines,
  selectable,
  accessibilityLabel,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  tone?: 'text' | 'muted' | 'subtle' | 'accent' | 'positive' | 'negative';
  variant?: 'display' | 'title' | 'headline' | 'body' | 'callout' | 'caption' | 'eyebrow' | 'mono';
  numberOfLines?: number;
  selectable?: boolean;
  accessibilityLabel?: string;
}) {
  const palette = useFinancePalette();
  return (
    <Text
      numberOfLines={numberOfLines}
      selectable={selectable}
      accessibilityLabel={accessibilityLabel}
      style={[{ color: palette[tone] }, typeStyles[variant], style]}>
      {children}
    </Text>
  );
}

const typeStyles = StyleSheet.create({
  display: { fontSize: 38, lineHeight: 44, fontWeight: '700', letterSpacing: -1, ...TABULAR },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.5 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2 },
  body: { fontSize: 15, lineHeight: 20 },
  callout: { fontSize: 14, lineHeight: 19 },
  caption: { fontSize: 12, lineHeight: 16 },
  eyebrow: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  mono: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
});

export function Card({
  children,
  style,
  padded = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  const palette = useFinancePalette();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: palette.card,
          borderColor: palette.border,
          shadowColor: palette.shadow,
        },
        padded && styles.cardPadded,
        style,
      ]}>
      {children}
    </View>
  );
}

export function SectionHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.flexShrink}>
        <FText variant="headline">{title}</FText>
        {subtitle ? (
          <FText variant="caption" tone="muted" style={styles.sectionSub}>
            {subtitle}
          </FText>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
}) {
  const palette = useFinancePalette();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[styles.segmented, { backgroundColor: palette.chip }]}>
      {options.map((option) => {
        const active = option === value;
        return (
          <Pressable
            key={option}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option)}
            hitSlop={4}
            style={[
              styles.segment,
              active && [styles.segmentActive, { backgroundColor: palette.card, shadowColor: palette.shadow }],
            ]}>
            <Text
              style={[
                styles.segmentLabel,
                { color: active ? palette.text : palette.muted },
                active && styles.segmentLabelActive,
              ]}>
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function TogglePill({
  label,
  value,
  onChange,
  color,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  color: string;
}) {
  const palette = useFinancePalette();
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={`${label} overlay`}
      hitSlop={4}
      style={[
        styles.toggle,
        {
          borderColor: value ? color : palette.border,
          backgroundColor: value ? `${color}1A` : palette.card,
        },
      ]}>
      <View
        style={[
          styles.toggleDot,
          { backgroundColor: value ? color : 'transparent', borderColor: value ? color : palette.subtle },
        ]}
      />
      <Text style={[styles.toggleLabel, { color: value ? color : palette.muted }]}>{label}</Text>
    </Pressable>
  );
}

export function DeltaBadge({
  amount,
  pct,
  suffix,
}: {
  amount?: number;
  pct: number | null;
  suffix?: string;
}) {
  const palette = useFinancePalette();
  const value = pct ?? amount ?? 0;
  const tone = value > 0 ? 'positive' : value < 0 ? 'negative' : 'muted';
  const bg =
    tone === 'positive' ? palette.positiveSoft : tone === 'negative' ? palette.negativeSoft : palette.chip;
  const arrow = value > 0 ? '▲' : value < 0 ? '▼' : '•';
  return (
    <View style={styles.deltaRow}>
      <View style={[styles.delta, { backgroundColor: bg }]}>
        <Text style={[styles.deltaText, { color: palette[tone] }]}>
          {arrow} {amount != null ? `${formatUsdSigned(amount)} · ` : ''}
          {formatPct(pct)}
        </Text>
      </View>
      {suffix ? (
        <FText variant="callout" tone="muted">
          {suffix}
        </FText>
      ) : null}
    </View>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const palette = useFinancePalette();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: palette.hairline, marginLeft: inset }} />;
}

export function Badge({ label, tone = 'muted' }: { label: string; tone?: 'muted' | 'accent' | 'warning' }) {
  const palette = useFinancePalette();
  const colors =
    tone === 'accent'
      ? { bg: palette.accentSoft, fg: palette.accent }
      : tone === 'warning'
        ? { bg: '#FFF4D6', fg: '#8A5A00' }
        : { bg: palette.chip, fg: palette.muted };
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.badgeText, { color: colors.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function Avatar({ label, color }: { label: string; color: string }) {
  const initials = label
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <View style={[styles.avatar, { backgroundColor: `${color}1F` }]}>
      <Text style={[styles.avatarText, { color }]}>{initials || '•'}</Text>
    </View>
  );
}

export function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  const palette = useFinancePalette();
  return (
    <View style={styles.legendItem}>
      <View style={styles.legendSwatch}>
        {dashed ? (
          <>
            <View style={[styles.legendDash, { backgroundColor: color }]} />
            <View style={[styles.legendDash, { backgroundColor: color }]} />
            <View style={[styles.legendDash, { backgroundColor: color }]} />
          </>
        ) : (
          <View style={[styles.legendLine, { backgroundColor: color }]} />
        )}
      </View>
      <Text style={[styles.legendLabel, { color: palette.muted }]}>{label}</Text>
    </View>
  );
}

export function StateMessage({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.state}>
      <FText variant="headline" style={styles.center}>
        {title}
      </FText>
      {body ? (
        <FText variant="callout" tone="muted" style={styles.center}>
          {body}
        </FText>
      ) : null}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 1,
    overflow: Platform.OS === 'web' ? 'hidden' : 'visible',
  },
  cardPadded: { padding: 16, gap: 14 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionSub: { marginTop: 2 },
  flexShrink: { flexShrink: 1 },
  segmented: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    alignSelf: 'flex-start',
  },
  segment: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, minWidth: 40, alignItems: 'center' },
  segmentActive: {
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 3,
    elevation: 1,
  },
  segmentLabel: { fontSize: 13, fontWeight: '500' },
  segmentLabelActive: { fontWeight: '700' },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  toggleDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
  toggleLabel: { fontSize: 13, fontWeight: '600' },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  delta: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  deltaText: { fontSize: 13, fontWeight: '700', ...TABULAR },
  badge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11, fontWeight: '600' },
  avatar: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13, fontWeight: '700' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 16, flexDirection: 'row', justifyContent: 'space-between' },
  legendLine: { width: 16, height: 3, borderRadius: 2 },
  legendDash: { width: 4, height: 3, borderRadius: 1 },
  legendLabel: { fontSize: 12, fontWeight: '500' },
  state: { alignItems: 'center', gap: 8, paddingVertical: 32, paddingHorizontal: 24 },
  center: { textAlign: 'center' },
});
