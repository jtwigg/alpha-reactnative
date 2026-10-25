import { useAction, useQuery } from 'convex/react';
import { Component, useEffect, useMemo, type ReactNode } from 'react';

import { NetWorthChart, type BenchmarkLine } from '@/components/finance/net-worth-chart';
import { FText } from '@/components/finance/ui';
import { api } from '@/lib/api';
import { useChartColors } from '@/lib/finance-colors';
import {
  BENCHMARKS,
  BENCHMARK_STALE_MS,
  DEFAULT_BENCHMARK,
  benchmarkValuesForDates,
} from '../../../server/convex/finance/benchmarks';
import type { ChartPoint, CoverageMarker } from '../../../server/convex/finance/series';

export function ChartBlock({
  points,
  markers,
  scrubIndex,
  onScrub,
  showBenchmark,
  seriesLabel,
  color,
  height,
  invert,
  spanFrom,
  spanTo,
  flowAdjusted,
}: {
  points: ChartPoint[];
  markers: CoverageMarker[];
  scrubIndex: number | null;
  onScrub: (index: number | null) => void;
  showBenchmark: boolean;
  seriesLabel?: string;
  color?: string;
  height?: number;
  invert?: boolean;
  /** Keep one market subscription across range switches. */
  spanFrom?: string;
  spanTo?: string;
  /** Flow-adjusted S&P path; used instead of the rebased index overlay. */
  flowAdjusted?: BenchmarkLine;
}) {
  const chart = (benchmark?: BenchmarkLine) => (
    <NetWorthChart
      points={points}
      markers={markers}
      scrubIndex={scrubIndex}
      onScrub={onScrub}
      benchmark={benchmark}
      seriesLabel={seriesLabel}
      color={color}
      height={height}
      headline
      showMarkerNotes={false}
      invert={invert}
    />
  );
  if (!showBenchmark) return chart();
  if (flowAdjusted) return chart(flowAdjusted);
  return (
    <SoftBoundary fallback={chart()}>
      <LiveBenchmarkChart points={points} spanFrom={spanFrom} spanTo={spanTo}>
        {chart}
      </LiveBenchmarkChart>
    </SoftBoundary>
  );
}

export function LiveBenchmarkChart({
  points,
  spanFrom,
  spanTo,
  children,
}: {
  points: ChartPoint[];
  spanFrom?: string;
  spanTo?: string;
  children: (benchmark?: BenchmarkLine) => ReactNode;
}) {
  const from = spanFrom ?? points[0]?.asOf;
  const to = spanTo ?? points[points.length - 1]?.asOf;
  const market = useQuery(api.finance.market.series, from && to ? { symbol: DEFAULT_BENCHMARK, from, to } : 'skip');
  const ensureMarket = useAction(api.finance.market.ensure);
  const benchmarkColor = useChartColors().benchmark;

  useEffect(() => {
    if (market === undefined) return;
    const stale =
      market.bars.length === 0 || market.refreshedAt == null || Date.now() - market.refreshedAt > BENCHMARK_STALE_MS;
    if (!stale) return;
    void ensureMarket({ symbol: DEFAULT_BENCHMARK }).catch(() => undefined);
  }, [ensureMarket, market]);

  const benchmark = useMemo<BenchmarkLine | undefined>(() => {
    if (!market || points.length === 0) return undefined;
    const values = benchmarkValuesForDates(
      points.map((point) => point.asOf),
      points[0].total,
      market.bars,
    );
    if (values.every((value) => value == null)) return undefined;
    return { label: market.label, color: benchmarkColor, values };
  }, [benchmarkColor, market, points]);

  return (
    <>
      {children(benchmark)}
      {market && market.bars.length === 0 ? (
        <FText variant="caption" tone="muted">
          Loading {BENCHMARKS.SPX.label}…
        </FText>
      ) : null}
    </>
  );
}

class SoftBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
