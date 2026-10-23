import { useMemo } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';
import type { AccountGroupKey } from '../../server/convex/finance/accountModel';
import { BENCHMARK_COLOR, GROUP_PALETTE, classColorFor, shadeFor, type ColorScheme } from './chart-palette';

export type ChartColors = {
  scheme: ColorScheme;
  groups: Record<AccountGroupKey, string>;
  classColor: (className: string) => string;
  shade: (base: string, index: number, count: number) => string;
  benchmark: string;
};

export function useChartColors(): ChartColors {
  const scheme: ColorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return useMemo(
    () => ({
      scheme,
      groups: GROUP_PALETTE[scheme],
      classColor: (className: string) => classColorFor(className, scheme),
      shade: (base: string, index: number, count: number) => shadeFor(base, index, count, scheme),
      benchmark: BENCHMARK_COLOR[scheme],
    }),
    [scheme],
  );
}
