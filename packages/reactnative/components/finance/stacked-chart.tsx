import { memo, useMemo, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { ChartTooltip, type TooltipRow } from '@/components/finance/chart-tooltip';
import { ChartTouch } from '@/components/finance/chart-touch';
import { FText, TABULAR, useFinancePalette } from '@/components/finance/ui';
import { axisDateLabel, formatCompactUsd, niceTicks, spanInDays } from '@/lib/chart-math';
import { formatCoverageDate, formatUsd } from '@/lib/finance-coverage';
import { loanShare, normalizeStack, type StackMode, type StackModel, type StackSeries } from '@/lib/stack-math';

const PAD = { top: 8, right: 58, bottom: 26, left: 2 };
const TOOLTIP_MAX_ROWS = 6;
const LEGEND_SIDE_MIN_WIDTH = 720;
const LOANS_COLOR = '#c2410c';

type Geometry = {
  ticks: number[];
  y: (value: number) => number;
  slot: number;
  barWidth: number;
  center: (index: number) => number;
};

export function formatShare(share: number | null): string {
  if (share == null || !Number.isFinite(share)) return '—';
  const pct = share * 100;
  return `${pct >= 10 || pct === 0 ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

/**
 * `model` is always in dollars. In normalized mode the bars show each asset
 * series as a share of gross assets and loans are reported separately.
 */
export function StackedChart({
  dates,
  model,
  mode,
  scrubIndex,
  onScrub,
  height = 240,
  netLabel,
}: {
  dates: string[];
  model: StackModel;
  mode: StackMode;
  scrubIndex: number | null;
  onScrub: (index: number | null) => void;
  height?: number;
  netLabel: string;
}) {
  const palette = useFinancePalette();
  const { width: screenWidth } = useWindowDimensions();
  const sideLegend = screenWidth >= LEGEND_SIDE_MIN_WIDTH;
  const [width, setWidth] = useState(0);
  const count = dates.length;
  const normalized = mode === 'normalized';
  const display = useMemo(() => (normalized ? normalizeStack(model) : model), [model, normalized]);
  const loans = model.series.filter((s) => s.group === 'liability');

  const geometry = useMemo<Geometry | null>(() => {
    if (width <= 0 || count === 0) return null;
    let ticks: number[];
    if (normalized) {
      ticks = [0, 25, 50, 75, 100];
    } else {
      const max = Math.max(0, ...display.positive);
      const min = Math.min(0, ...display.negative);
      ticks = niceTicks(min, max === min ? min + 1 : max, 4);
    }
    const y0 = ticks[0];
    const y1 = ticks[ticks.length - 1];
    const innerW = Math.max(width - PAD.left - PAD.right, 1);
    const innerH = Math.max(height - PAD.top - PAD.bottom, 1);
    const slot = innerW / count;
    const barWidth = slot >= 4 ? Math.max(slot * 0.72, 1.5) : Math.max(slot, 1);
    return {
      ticks,
      y: (value: number) => PAD.top + (1 - (value - y0) / (y1 - y0 || 1)) * innerH,
      slot,
      barWidth,
      center: (index: number) => PAD.left + slot * (index + 0.5),
    };
  }, [count, display.negative, display.positive, height, normalized, width]);

  const active = scrubIndex ?? (count > 0 ? count - 1 : null);
  const span = count > 1 ? spanInDays(dates[0], dates[count - 1]) : 0;
  const xLabels =
    count > 1 ? [0, Math.round((count - 1) / 2), count - 1].filter((v, i, a) => a.indexOf(v) === i) : [];

  const assetsTopFirst = useMemo(
    () => model.series.filter((s) => s.group !== 'liability').reverse(),
    [model.series],
  );

  const tooltipRows = (index: number): TooltipRow[] => {
    const gross = model.positive[index];
    const share = (value: number) => formatShare(gross > 0 ? Math.abs(value) / gross : null);
    const row = (s: StackSeries): TooltipRow =>
      normalized
        ? { label: s.label, color: s.color, value: share(s.values[index]), detail: formatUsd(Math.abs(s.values[index])) }
        : { label: s.label, color: s.color, value: formatUsd(s.values[index]), detail: share(s.values[index]) };
    const assetRows = assetsTopFirst.filter((s) => s.values[index] !== 0).map(row);
    const rows: TooltipRow[] = [
      normalized
        ? { label: 'Gross assets', value: formatUsd(gross), emphasis: true }
        : { label: netLabel, value: formatUsd(model.net[index]), emphasis: true },
      ...assetRows.slice(0, TOOLTIP_MAX_ROWS),
    ];
    if (assetRows.length > TOOLTIP_MAX_ROWS) {
      rows.push({ label: `+${assetRows.length - TOOLTIP_MAX_ROWS} more`, value: '' });
    }
    const owed = -model.negative[index];
    if (loans.length > 0 && owed > 0) {
      rows.push({
        label: normalized ? 'Loans (of gross)' : 'Loans',
        color: LOANS_COLOR,
        value: normalized ? formatShare(loanShare(model, index)) : formatUsd(-owed),
        detail: normalized ? formatUsd(-owed) : formatShare(loanShare(model, index)),
      });
    }
    return rows;
  };

  const hairX = geometry && scrubIndex != null ? geometry.center(scrubIndex) : null;

  const chart = (
    <ChartTouch
      count={count}
      padLeft={PAD.left + (geometry?.slot ?? 0) / 2}
      padRight={PAD.right + (geometry?.slot ?? 0) / 2}
      height={height}
      onScrub={onScrub}
      onWidth={setWidth}>
      {geometry ? (
        <>
          {geometry.ticks.map((tick) => (
            <View key={`grid-${tick}`}>
              <View
                style={[
                  styles.grid,
                  {
                    top: geometry.y(tick),
                    left: PAD.left,
                    right: PAD.right - 6,
                    backgroundColor: tick === 0 ? palette.border : palette.grid,
                  },
                ]}
              />
              <Text style={[styles.yLabel, { top: geometry.y(tick) - 8, color: palette.subtle }]} numberOfLines={1}>
                {normalized ? `${tick}%` : formatCompactUsd(tick)}
              </Text>
            </View>
          ))}
          {hairX != null ? (
            <View
              style={[
                styles.band,
                {
                  left: hairX - geometry.slot / 2,
                  width: geometry.slot,
                  top: PAD.top,
                  height: height - PAD.top - PAD.bottom,
                  backgroundColor: palette.pressed,
                },
              ]}
            />
          ) : null}
          <Bars model={display} geometry={geometry} />
          {hairX != null && !normalized ? (
            <View
              style={[
                styles.netTick,
                {
                  left: hairX - geometry.barWidth / 2 - 2,
                  width: geometry.barWidth + 4,
                  top: geometry.y(model.net[scrubIndex!] ?? 0) - 1,
                  backgroundColor: palette.crosshair,
                },
              ]}
            />
          ) : null}
          {xLabels.map((index, i) => (
            <Text
              key={`x-${index}`}
              numberOfLines={1}
              style={[
                styles.xLabel,
                { color: palette.subtle, top: height - 18 },
                i === 0
                  ? { left: PAD.left }
                  : i === xLabels.length - 1
                    ? { right: PAD.right - 6, textAlign: 'right' }
                    : { left: geometry.center(index) - 40, width: 80, textAlign: 'center' },
              ]}>
              {axisDateLabel(dates[index], span)}
            </Text>
          ))}
          {hairX != null && model.covered[scrubIndex!] ? (
            <ChartTooltip
              date={dates[scrubIndex!]}
              rows={tooltipRows(scrubIndex!)}
              style={[
                styles.tooltip,
                hairX > width / 2 ? { right: width - hairX + 12 } : { left: hairX + 12 },
                { maxWidth: Math.min(Math.max((hairX > width / 2 ? hairX : width - hairX) - 16, 150), 280) },
              ]}
            />
          ) : null}
        </>
      ) : null}
    </ChartTouch>
  );

  const legend =
    active != null ? (
      <StackLegend
        model={model}
        assetsTopFirst={assetsTopFirst}
        loans={loans}
        index={active}
        normalized={normalized}
        side={sideLegend}
      />
    ) : null;

  return (
    <View style={styles.wrap}>
      {active != null ? (
        <View style={styles.head}>
          <FText variant="caption" tone={scrubIndex != null ? 'text' : 'muted'} style={styles.headDate}>
            {formatCoverageDate(dates[active])}
          </FText>
          <FText variant="caption" tone="muted">
            {normalized ? 'Gross assets' : netLabel}{' '}
            <Text style={[styles.headValue, TABULAR, { color: palette.text }]}>
              {model.covered[active]
                ? formatUsd(normalized ? model.positive[active] : model.net[active])
                : '—'}
            </Text>
          </FText>
          {normalized && loans.length > 0 && model.covered[active] ? (
            <FText variant="caption" tone="muted">
              Loans{' '}
              <Text style={[styles.headValue, TABULAR, { color: palette.negative }]}>
                {formatShare(loanShare(model, active))}
              </Text>{' '}
              of gross assets
            </FText>
          ) : null}
        </View>
      ) : null}
      {sideLegend ? (
        <View style={styles.sideRow}>
          <View style={styles.sideChart}>{chart}</View>
          {legend}
        </View>
      ) : (
        <>
          {chart}
          {legend}
        </>
      )}
    </View>
  );
}

const Bars = memo(function Bars({ model, geometry }: { model: StackModel; geometry: Geometry }) {
  const views: React.ReactElement[] = [];
  const count = model.positive.length;
  for (let i = 0; i < count; i += 1) {
    if (!model.covered[i]) continue;
    const left = geometry.center(i) - geometry.barWidth / 2;
    let up = 0;
    let down = 0;
    for (const series of model.series) {
      const value = series.values[i];
      if (!value) continue;
      const from = value > 0 ? up : down;
      const to = from + value;
      if (value > 0) up = to;
      else down = to;
      const top = Math.min(geometry.y(from), geometry.y(to));
      const bottom = Math.max(geometry.y(from), geometry.y(to));
      views.push(
        <View
          key={`${series.key}-${i}`}
          style={{
            position: 'absolute',
            left,
            width: geometry.barWidth,
            top,
            height: Math.max(bottom - top, 0.5),
            backgroundColor: series.color,
          }}
        />,
      );
    }
  }
  return <View style={StyleSheet.absoluteFill}>{views}</View>;
});

/** Top-first so the order matches the bars; values follow the active date. */
function StackLegend({
  model,
  assetsTopFirst,
  loans,
  index,
  normalized,
  side,
}: {
  model: StackModel;
  assetsTopFirst: StackSeries[];
  loans: StackSeries[];
  index: number;
  normalized: boolean;
  side: boolean;
}) {
  const palette = useFinancePalette();
  const gross = model.positive[index];
  const covered = model.covered[index];
  const item = (s: StackSeries, isLoan: boolean) => {
    const dollars = s.values[index];
    const share = formatShare(gross > 0 ? Math.abs(dollars) / gross : null);
    const primary = !covered || dollars === 0 ? '—' : normalized ? share : formatCompactUsd(dollars);
    const secondary = !covered || dollars === 0 ? '' : normalized ? formatCompactUsd(Math.abs(dollars)) : share;
    return (
      <View key={s.key} style={[styles.legendItem, side && styles.legendItemSide]}>
        <View
          style={[
            styles.swatch,
            isLoan && normalized
              ? { backgroundColor: 'transparent', borderWidth: 2, borderColor: s.color }
              : { backgroundColor: s.color },
          ]}
        />
        <FText variant="caption" tone="muted" numberOfLines={1} style={styles.legendLabel}>
          {s.label}
        </FText>
        <Text style={[styles.legendValue, TABULAR, { color: isLoan ? palette.negative : palette.text }]}>
          {primary}
        </Text>
        {secondary ? (
          <Text style={[styles.legendSecondary, TABULAR, { color: palette.subtle }]}>{secondary}</Text>
        ) : null}
      </View>
    );
  };
  return (
    <View style={side ? [styles.legendSide, { borderLeftColor: palette.hairline }] : styles.legendBelow}>
      {assetsTopFirst.map((s) => item(s, false))}
      {loans.length > 0 ? (
        <>
          {side ? <View style={[styles.legendDivider, { backgroundColor: palette.hairline }]} /> : null}
          {normalized && side ? (
            <FText variant="caption" tone="subtle" style={styles.legendNote}>
              Not stacked · % of gross assets
            </FText>
          ) : null}
          {loans.map((s) => item(s, true))}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  head: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 14, rowGap: 2 },
  headDate: { fontWeight: '700' },
  headValue: { fontWeight: '700', fontSize: 13 },
  sideRow: { flexDirection: 'row', gap: 16 },
  sideChart: { flex: 1, minWidth: 0 },
  grid: { position: 'absolute', height: StyleSheet.hairlineWidth },
  yLabel: { position: 'absolute', right: 0, width: 52, fontSize: 11, textAlign: 'right', ...TABULAR },
  xLabel: { position: 'absolute', fontSize: 11 },
  band: { position: 'absolute', borderRadius: 3 },
  netTick: { position: 'absolute', height: 2, borderRadius: 1 },
  tooltip: { position: 'absolute', top: 4 },
  legendBelow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 },
  legendSide: { width: 230, gap: 6, paddingLeft: 14, borderLeftWidth: StyleSheet.hairlineWidth, paddingTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 240 },
  legendItemSide: { maxWidth: undefined },
  legendLabel: { flexShrink: 1, flexGrow: 1 },
  legendValue: { fontSize: 12, fontWeight: '600' },
  legendSecondary: { fontSize: 11, minWidth: 36, textAlign: 'right' },
  legendDivider: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
  legendNote: { fontSize: 10 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
});
