import { useRouter, type Href } from 'expo-router';
import { Fragment, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import {
  Avatar,
  Badge,
  Card,
  Divider,
  FText,
  StateMessage,
  TABULAR,
  useFinancePalette,
} from '@/components/finance/ui';
import { Sparkline } from '@/components/finance/sparkline';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useChartColors } from '@/lib/finance-colors';
import { formatCompactUsd } from '@/lib/chart-math';
import { formatCoverageDate, formatPct, formatPp, formatUsd, formatUsdSigned } from '@/lib/finance-coverage';
import type {
  AccountGroup,
  AccountGroupKey,
  AccountListModel,
  AccountListRow,
  ChangeTone,
  Contribution,
  GroupSparklineRow,
  SparklineRow,
} from '../../../server/convex/finance/accountModel';

export function accountHref(sourceId: string, demo: boolean): Href {
  const base = `/finances/account/${encodeURIComponent(sourceId)}`;
  return (demo ? `${base}?demo=1` : base) as Href;
}

export type ChangeMode = 'own' | 'weighted';
export const CHANGE_MODES: readonly ChangeMode[] = ['own', 'weighted'];

/** `weighted` is missing when talking to a backend deployed before it existed. */
type WithWeighted<T> = T & { weighted?: Contribution };

export type AccountTrends = {
  /** undefined while loading; rows missing from the map have no trend. */
  rows: Map<string, WithWeighted<SparklineRow>> | undefined;
  groups: Map<AccountGroupKey, WithWeighted<GroupSparklineRow>> | undefined;
  rangeLabel: string;
  mode: ChangeMode;
};

type TrendData = WithWeighted<Pick<SparklineRow, 'values' | 'change' | 'changePct' | 'tone'>>;

type ShownChange = { pct: string; dollars: number | null; tone: ChangeTone };

/** Own % change, or contribution to the parent's change in percentage points. */
function shownChange(trend: TrendData | undefined, mode: ChangeMode): ShownChange | null {
  if (!trend) return null;
  if (mode === 'own') return { pct: formatPct(trend.changePct), dollars: trend.change, tone: trend.tone };
  if (!trend.weighted) return { pct: '—', dollars: null, tone: 'flat' };
  return { pct: formatPp(trend.weighted.pct), dollars: trend.weighted.change, tone: trend.weighted.tone };
}

function changeA11y(trend: TrendData | undefined, trends: AccountTrends | undefined, parent: string): string {
  const shown = trends ? shownChange(trend, trends.mode) : null;
  if (!shown || shown.pct === '—') return '';
  const dollars = shown.dollars != null ? ` (${formatUsdSigned(shown.dollars)})` : '';
  return trends!.mode === 'own'
    ? `, ${shown.pct}${dollars} ${trends!.rangeLabel}`
    : `, ${shown.pct}${dollars} of ${parent} change ${trends!.rangeLabel}`;
}

export function AccountGroups({
  model,
  demo,
  trends,
  selectedGroup = null,
  onSelectGroup,
}: {
  model: AccountListModel;
  demo: boolean;
  trends?: AccountTrends;
  selectedGroup?: AccountGroupKey | null;
  onSelectGroup?: (key: AccountGroupKey | null) => void;
}) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<AccountGroupKey>>(new Set());
  const toggle = (key: AccountGroupKey) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  if (model.groups.length === 0) {
    return (
      <Card>
        <StateMessage
          title="No accounts yet"
          body="Accounts appear here once the Finance agent syncs them."
        />
      </Card>
    );
  }
  return (
    <View style={styles.groups}>
      {model.groups.map((group) => (
        <GroupCard
          key={group.key}
          group={group}
          demo={demo}
          trends={trends}
          collapsed={collapsed.has(group.key)}
          onToggle={() => toggle(group.key)}
          selected={selectedGroup === group.key}
          onSelect={
            onSelectGroup ? () => onSelectGroup(selectedGroup === group.key ? null : group.key) : undefined
          }
        />
      ))}
    </View>
  );
}

function GroupCard({
  group,
  demo,
  trends,
  collapsed,
  onToggle,
  selected,
  onSelect,
}: {
  group: AccountGroup;
  demo: boolean;
  trends?: AccountTrends;
  collapsed: boolean;
  onToggle: () => void;
  selected: boolean;
  onSelect?: () => void;
}) {
  const palette = useFinancePalette();
  const { width } = useWindowDimensions();
  const compact = width < 560;
  const color = useChartColors().groups[group.key];
  const trend = trends?.groups?.get(group.key);
  const loading = trends != null && trends.groups === undefined;
  const subtotal = (
    <FText
      variant="headline"
      tone={group.subtotal < 0 ? 'negative' : 'text'}
      style={TABULAR}
      accessibilityLabel={`${group.label} subtotal`}>
      {formatUsd(group.subtotal)}
    </FText>
  );
  const pctText = changeA11y(trend, trends, 'net worth');
  return (
    <Card padded={false} style={selected ? { borderColor: color } : undefined}>
      <View
        style={[
          styles.groupHeader,
          { backgroundColor: selected ? `${color}14` : palette.cardAlt, borderBottomColor: palette.hairline },
          collapsed && styles.groupHeaderCollapsed,
        ]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${collapsed ? 'Expand' : 'Collapse'} ${group.label}`}
          accessibilityState={{ expanded: !collapsed }}
          onPress={onToggle}
          hitSlop={10}
          style={(state) => [
            styles.collapse,
            (state.pressed || (state as { hovered?: boolean }).hovered) && { backgroundColor: palette.pressed },
          ]}>
          <IconSymbol
            name="chevron.down"
            size={18}
            color={palette.muted}
            style={{ transform: [{ rotate: collapsed ? '-90deg' : '0deg' }] }}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected }}
          accessibilityLabel={`${group.label}, ${formatUsd(group.subtotal)}${pctText}. ${
            selected ? 'Shown in chart. Tap to show all.' : 'Show in chart.'
          }`}
          disabled={!onSelect}
          onPress={onSelect}
          style={styles.groupSelect}>
          <View style={styles.groupTitle}>
            <View style={[styles.groupDot, { backgroundColor: color }]} />
            <FText variant="eyebrow" tone={selected ? 'text' : 'muted'}>
              {group.label}
            </FText>
            {compact ? null : (
              <FText variant="caption" tone="subtle">
                {group.count} {group.count === 1 ? 'account' : 'accounts'}
              </FText>
            )}
            {selected ? <Badge label="In chart" /> : null}
          </View>
          {compact ? (
            <View style={styles.rowRight}>
              {subtotal}
              {trends ? <TrendCell loading={loading} trend={trend} mode={trends.mode} sparkWidth={44} inline /> : null}
            </View>
          ) : (
            <View style={styles.groupRight}>
              {trends ? (
                <TrendCell loading={loading} trend={trend} mode={trends.mode} sparkWidth={width >= 720 ? 96 : 72} />
              ) : null}
              {subtotal}
            </View>
          )}
        </Pressable>
      </View>
      {collapsed
        ? null
        : group.accounts.map((account, index) => (
            <Fragment key={account.sourceId}>
              {index > 0 ? <Divider inset={66} /> : null}
              <AccountRow account={account} color={color} demo={demo} trends={trends} groupLabel={group.label} />
            </Fragment>
          ))}
    </Card>
  );
}

function AccountRow({
  account,
  color,
  demo,
  trends,
  groupLabel,
}: {
  account: AccountListRow;
  color: string;
  demo: boolean;
  trends?: AccountTrends;
  groupLabel: string;
}) {
  const router = useRouter();
  const palette = useFinancePalette();
  const { width } = useWindowDimensions();
  const compact = width < 560;
  const trend = trends?.rows?.get(account.sourceId);
  const trendText = changeA11y(trend, trends, groupLabel);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${account.name}, ${formatUsd(account.signedBalance)}${trendText}`}
      onPress={() => router.push(accountHref(account.sourceId, demo))}
      style={(state) => {
        const hovered = (state as { hovered?: boolean }).hovered;
        return [styles.row, (state.pressed || hovered) && { backgroundColor: palette.pressed }];
      }}>
      <Avatar label={account.name} color={color} />
      <View style={styles.rowMain}>
        <View style={styles.rowTitle}>
          <FText variant="body" style={styles.name} numberOfLines={1}>
            {account.name}
          </FText>
          {account.mask && !compact ? (
            <FText variant="caption" tone="subtle">
              ••{account.mask}
            </FText>
          ) : null}
        </View>
        <View style={styles.rowMeta}>
          <FText variant="caption" tone="muted" numberOfLines={1} style={styles.metaText}>
            {compact && account.mask ? `••${account.mask} · ` : ''}
            {account.institution} · {account.type}
          </FText>
          {account.isManual ? <Badge label="Manual" /> : null}
        </View>
        {compact ? (
          <FText variant="caption" tone="subtle">
            Updated {formatCoverageDate(account.lastUpdated)}
          </FText>
        ) : null}
      </View>
      {trends && !compact ? (
        <TrendCell
          loading={trends.rows === undefined}
          trend={trend}
          mode={trends.mode}
          sparkWidth={width >= 720 ? 96 : 72}
        />
      ) : null}
      <View style={styles.rowRight}>
        <FText
          variant="body"
          tone={account.signedBalance < 0 ? 'negative' : 'text'}
          style={[styles.balance, TABULAR]}>
          {formatUsd(account.signedBalance)}
        </FText>
        {compact ? (
          trends ? (
            <TrendCell loading={trends.rows === undefined} trend={trend} mode={trends.mode} sparkWidth={44} inline />
          ) : null
        ) : (
          <FText variant="caption" tone="subtle">
            {formatCoverageDate(account.lastUpdated)}
          </FText>
        )}
      </View>
      <IconSymbol name="chevron.right" size={18} color={palette.subtle} />
    </Pressable>
  );
}

function toneColor(tone: ChangeTone, palette: ReturnType<typeof useFinancePalette>): string {
  if (tone === 'good') return palette.positive;
  if (tone === 'bad') return palette.negative;
  return palette.subtle;
}

/** Stacked (sparkline over % and $) beside the balance, or inline under it on narrow screens. */
function TrendCell({
  loading,
  trend,
  mode,
  sparkWidth,
  inline = false,
}: {
  loading: boolean;
  trend: TrendData | undefined;
  mode: ChangeMode;
  sparkWidth: number;
  inline?: boolean;
}) {
  const palette = useFinancePalette();
  const sparkHeight = inline ? 16 : 26;
  const layout = inline ? styles.trendInline : [styles.trend, { width: sparkWidth }];
  if (loading) {
    return (
      <View style={layout}>
        <View
          style={[styles.sparkSkeleton, { width: sparkWidth, height: sparkHeight, backgroundColor: palette.chip }]}
        />
        <View style={[styles.pctSkeleton, { backgroundColor: palette.chip }]} />
      </View>
    );
  }
  const shown = shownChange(trend, mode);
  const color = shown ? toneColor(shown.tone, palette) : palette.subtle;
  const dollars =
    shown?.dollars == null ? null : inline ? signedCompact(shown.dollars) : formatUsdSigned(Math.round(shown.dollars));
  return (
    <View style={layout}>
      <Sparkline values={trend?.values ?? []} color={color} width={sparkWidth} height={sparkHeight} />
      <View style={inline ? styles.changeInline : styles.change}>
        <Text style={[styles.pct, TABULAR, { color }]} numberOfLines={1}>
          {shown?.pct ?? '—'}
        </Text>
        {dollars ? (
          <Text style={[styles.dollars, TABULAR, { color }]} numberOfLines={1}>
            {dollars}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function signedCompact(amount: number): string {
  if (Math.abs(amount) < 0.5) return '$0';
  return amount > 0 ? `+${formatCompactUsd(amount)}` : formatCompactUsd(amount);
}

const styles = StyleSheet.create({
  groups: { gap: 14 },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 8,
    paddingRight: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  groupHeaderCollapsed: {
    borderBottomWidth: 0,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  collapse: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  groupSelect: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 40,
  },
  groupRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  groupTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  groupDot: { width: 8, height: 8, borderRadius: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 64,
  },
  rowMain: { flex: 1, gap: 3, minWidth: 0 },
  rowTitle: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  name: { fontWeight: '600', flexShrink: 1 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { flexShrink: 1 },
  rowRight: { alignItems: 'flex-end', gap: 3 },
  balance: { fontWeight: '600' },
  trend: { alignItems: 'flex-end', gap: 2, minWidth: 72 },
  trendInline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sparkSkeleton: { borderRadius: 5, opacity: 0.6 },
  pctSkeleton: { width: 34, height: 10, borderRadius: 4, opacity: 0.6 },
  pct: { fontSize: 11, fontWeight: '700', letterSpacing: 0.1 },
  dollars: { fontSize: 11, fontWeight: '500', opacity: 0.85 },
  change: { alignItems: 'flex-end' },
  changeInline: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
});
