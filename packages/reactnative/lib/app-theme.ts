import { Platform, StyleSheet, type TextStyle, type ViewStyle } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';

/** Finances visual system — shared by every screen, tab bar, and header. */
export const LIGHT = {
  page: '#F3F4F6',
  card: '#FFFFFF',
  cardAlt: '#F8F9FB',
  border: '#E4E7EB',
  hairline: '#EDEFF2',
  text: '#0F1419',
  muted: '#5B6670',
  subtle: '#88929C',
  accent: '#0A7EA4',
  accentSoft: '#E3F2F8',
  positive: '#15803D',
  positiveSoft: '#E6F4EA',
  negative: '#C2362F',
  negativeSoft: '#FCE9E7',
  chip: '#EEF0F3',
  pressed: '#F1F3F5',
  grid: '#EEF0F3',
  crosshair: '#5B6670',
  tooltip: '#FFFFFF',
  shadow: 'rgba(15, 20, 25, 0.06)',
  tooltipShadow: 'rgba(16, 24, 40, 0.16)',
};

export type AppPalette = typeof LIGHT;

export const DARK: AppPalette = {
  page: '#0B0D0F',
  card: '#16191C',
  cardAlt: '#1B1F23',
  border: '#272C31',
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
  chip: '#202428',
  pressed: '#1F2428',
  grid: '#20252A',
  crosshair: '#A0A7AD',
  tooltip: '#21262B',
  shadow: 'rgba(0, 0, 0, 0.4)',
  tooltipShadow: 'rgba(0, 0, 0, 0.55)',
};

export function useAppPalette(): AppPalette {
  return useColorScheme() === 'dark' ? DARK : LIGHT;
}

export const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

export const MAX_CONTENT_WIDTH = 960;

export const TYPE = StyleSheet.create({
  display: { fontSize: 40, lineHeight: 46, fontWeight: '700', letterSpacing: -1.2, ...TABULAR },
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

export const CARD_CHROME: ViewStyle = {
  borderRadius: 18,
  borderWidth: StyleSheet.hairlineWidth,
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 1,
  shadowRadius: 6,
  elevation: 1,
};

export function navColors(scheme: 'light' | 'dark' | null | undefined) {
  const palette = scheme === 'dark' ? DARK : LIGHT;
  return {
    text: palette.text,
    background: palette.page,
    tint: palette.accent,
    icon: palette.muted,
    tabIconDefault: palette.muted,
    tabIconSelected: palette.accent,
  };
}
