import { chartOverlayKind, type ChartOverlayKind } from '@/lib/chart-overlay';
import { usePersistedFlag } from '@/lib/prefs';

export { chartOverlayKind, type ChartOverlayKind };

export const CHART_MODE_KEYS = {
  timeWeighted: 'finance.chart.timeWeighted',
  sp500: 'finance.chart.sp500',
  twrAll: 'finance.chart.twrAll',
} as const;

export function useChartMode() {
  const [timeWeighted, setTimeWeighted] = usePersistedFlag(CHART_MODE_KEYS.timeWeighted, false);
  const [showSp500, setShowSp500] = usePersistedFlag(CHART_MODE_KEYS.sp500, false);
  const [twrAll, setTwrAll] = usePersistedFlag(CHART_MODE_KEYS.twrAll, false);
  return { timeWeighted, setTimeWeighted, showSp500, setShowSp500, twrAll, setTwrAll };
}
