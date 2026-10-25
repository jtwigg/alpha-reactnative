export type ChartOverlayKind = 'twr' | 'twr+sp500' | 'balance' | 'balance+flow' | 'balance+rebased';

/** Which chart + S&P overlay the two independent toggles should produce. */
export function chartOverlayKind(args: {
  timeWeighted: boolean;
  showSp500: boolean;
  hasSeries: boolean;
}): ChartOverlayKind {
  if (args.timeWeighted) return args.showSp500 ? 'twr+sp500' : 'twr';
  if (!args.showSp500) return 'balance';
  return args.hasSeries ? 'balance+flow' : 'balance+rebased';
}
