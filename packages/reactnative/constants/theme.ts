/**
 * App-wide colors come from the Finances visual system.
 */

import { Platform } from 'react-native';

import { DARK, LIGHT } from '@/lib/app-theme';

export const Colors = {
  light: {
    text: LIGHT.text,
    background: LIGHT.page,
    tint: LIGHT.accent,
    icon: LIGHT.muted,
    tabIconDefault: LIGHT.muted,
    tabIconSelected: LIGHT.accent,
  },
  dark: {
    text: DARK.text,
    background: DARK.page,
    tint: DARK.accent,
    icon: DARK.muted,
    tabIconDefault: DARK.muted,
    tabIconSelected: DARK.accent,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
