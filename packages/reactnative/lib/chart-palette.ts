import type { AccountGroupKey } from '../../server/convex/finance/accountModel';

export type ColorScheme = 'light' | 'dark';

/**
 * One hue per group, tuned per scheme so each clears 3:1 against its card
 * (light #FFFFFF, dark #16191C) and the four stay distinguishable for the
 * common forms of color blindness (teal / blue / violet / orange).
 */
export const GROUP_PALETTE: Record<ColorScheme, Record<AccountGroupKey, string>> = {
  light: {
    cash: '#0F9488',
    investments: '#2F6FEB',
    real_estate: '#8B5CF6',
    liability: '#E8590C',
    other: '#64748B',
  },
  dark: {
    cash: '#2DD4BF',
    investments: '#60A5FA',
    real_estate: '#B49CFB',
    liability: '#FB8C4B',
    other: '#94A3B8',
  },
};

/** Classes map onto their group hue; credit is a deeper loan tone. */
const CLASS_PALETTE: Record<ColorScheme, Record<string, string>> = {
  light: {
    cash: GROUP_PALETTE.light.cash,
    investments: GROUP_PALETTE.light.investments,
    real_estate: GROUP_PALETTE.light.real_estate,
    liability: GROUP_PALETTE.light.liability,
    credit: '#D6336C',
  },
  dark: {
    cash: GROUP_PALETTE.dark.cash,
    investments: GROUP_PALETTE.dark.investments,
    real_estate: GROUP_PALETTE.dark.real_estate,
    liability: GROUP_PALETTE.dark.liability,
    credit: '#F472A0',
  },
};

/** Neutral comparison line so it never reads as one of the groups. */
export const BENCHMARK_COLOR: Record<ColorScheme, string> = { light: '#475467', dark: '#CBD2D9' };

export function classColorFor(className: string, scheme: ColorScheme = 'light'): string {
  return CLASS_PALETTE[scheme][className] ?? GROUP_PALETTE[scheme].other;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(from: string, to: string, t: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  return `#${a
    .map((c, i) => Math.round(c + (b[i] - c) * t).toString(16).padStart(2, '0'))
    .join('')}`;
}

/**
 * Account shades within a group. Index 0 is the group hue; later accounts step
 * toward white in light mode and toward the card in dark mode, alternating
 * near/far so neighbouring bands stay separable.
 */
export function shadeFor(base: string, index: number, count: number, scheme: ColorScheme = 'light'): string {
  if (count <= 1 || index === 0) return base;
  const steps = count - 1;
  const order = index % 2 === 1 ? Math.ceil(index / 2) : steps - index / 2 + 1;
  const t = (Math.min(order, steps) / steps) * (scheme === 'dark' ? 0.5 : 0.58);
  return mix(base, scheme === 'dark' ? '#16191C' : '#FFFFFF', t);
}
