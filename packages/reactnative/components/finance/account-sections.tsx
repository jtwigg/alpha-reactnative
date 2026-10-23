import { Fragment } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import {
  Badge,
  Card,
  Divider,
  FText,
  SectionHeader,
  StateMessage,
  TABULAR,
  useFinancePalette,
} from '@/components/finance/ui';
import { classLabel, formatCoverageDate, formatUsd } from '@/lib/finance-coverage';
import {
  displayAmount,
  groupByDate,
  type HoldingsModel,
} from '../../../server/convex/finance/accountModel';

const HOLDING_COLORS = ['#0a7ea4', '#7c3aed', '#16a34a', '#d97706', '#db2777', '#0891b2', '#64748b'];

function formatQty(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: value < 1 ? 4 : 3 }).format(value);
}

function formatPrice(value: number | null): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value);
}

function formatShare(value: number | null): string {
  if (value == null) return '—';
  return `${(value * 100).toFixed(value < 0.1 ? 1 : 0)}%`;
}

export function HoldingsCard({ holdings }: { holdings: HoldingsModel }) {
  const palette = useFinancePalette();
  const { width } = useWindowDimensions();
  const wide = width >= 720;
  if (holdings.rows.length === 0) return null;
  return (
    <Card>
      <SectionHeader
        title="Holdings"
        subtitle={`${holdings.rows.length} positions${holdings.asOf ? ` · as of ${formatCoverageDate(holdings.asOf)}` : ''}`}
        right={
          <FText variant="headline" style={TABULAR}>
            {formatUsd(holdings.total)}
          </FText>
        }
      />
      <View style={[styles.allocation, { backgroundColor: palette.chip }]}>
        {holdings.rows.map((row, index) => (
          <View
            key={row.symbol}
            style={{
              flex: Math.max(row.pctOfAccount ?? 0, 0.002),
              backgroundColor: HOLDING_COLORS[index % HOLDING_COLORS.length],
            }}
          />
        ))}
      </View>
      {wide ? (
        <View style={[styles.tableHead, { borderBottomColor: palette.hairline }]}>
          <FText variant="eyebrow" tone="subtle" style={styles.colSymbol}>
            Symbol
          </FText>
          <FText variant="eyebrow" tone="subtle" style={styles.colNum}>
            Quantity
          </FText>
          <FText variant="eyebrow" tone="subtle" style={styles.colNum}>
            Price
          </FText>
          <FText variant="eyebrow" tone="subtle" style={styles.colNum}>
            Value
          </FText>
          <FText variant="eyebrow" tone="subtle" style={styles.colPct}>
            % of acct
          </FText>
        </View>
      ) : null}
      <View>
        {holdings.rows.map((row, index) => {
          const color = HOLDING_COLORS[index % HOLDING_COLORS.length];
          return (
            <Fragment key={row.symbol}>
              {index > 0 ? <Divider /> : null}
              {wide ? (
                <View style={styles.tableRow}>
                  <View style={[styles.colSymbol, styles.symbolCell]}>
                    <View style={[styles.swatch, { backgroundColor: color }]} />
                    <View>
                      <FText variant="body" style={styles.strong}>
                        {row.symbol}
                      </FText>
                      {row.name !== row.symbol ? (
                        <FText variant="caption" tone="muted" numberOfLines={1}>
                          {row.name}
                        </FText>
                      ) : null}
                    </View>
                  </View>
                  <FText variant="callout" style={[styles.colNum, TABULAR]}>
                    {formatQty(row.quantity)}
                  </FText>
                  <FText variant="callout" style={[styles.colNum, TABULAR]}>
                    {formatPrice(row.price)}
                  </FText>
                  <FText variant="callout" style={[styles.colNum, styles.strong, TABULAR]}>
                    {formatUsd(row.value)}
                  </FText>
                  <FText variant="callout" tone="muted" style={[styles.colPct, TABULAR]}>
                    {formatShare(row.pctOfAccount)}
                  </FText>
                </View>
              ) : (
                <View style={styles.holdingRow}>
                  <View style={[styles.swatch, { backgroundColor: color }]} />
                  <View style={styles.flex}>
                    <FText variant="body" style={styles.strong}>
                      {row.symbol}
                    </FText>
                    <FText variant="caption" tone="muted" style={TABULAR}>
                      {formatQty(row.quantity)} × {formatPrice(row.price)}
                    </FText>
                  </View>
                  <View style={styles.right}>
                    <FText variant="body" style={[styles.strong, TABULAR]}>
                      {formatUsd(row.value)}
                    </FText>
                    <FText variant="caption" tone="muted" style={TABULAR}>
                      {formatShare(row.pctOfAccount)} of account
                    </FText>
                  </View>
                </View>
              )}
            </Fragment>
          );
        })}
      </View>
    </Card>
  );
}

export type TransactionRow = {
  _id: string;
  date: string;
  description: string;
  amount: number;
  direction: string;
  category: string | null;
  pending: boolean;
};

export type TransactionsStatus = 'LoadingFirstPage' | 'CanLoadMore' | 'LoadingMore' | 'Exhausted';

export function TransactionsCard({
  rows,
  status,
  onLoadMore,
}: {
  rows: TransactionRow[];
  status: TransactionsStatus;
  onLoadMore: () => void;
}) {
  const palette = useFinancePalette();
  const groups = groupByDate(rows);
  return (
    <Card padded={false}>
      <View style={styles.cardHeader}>
        <SectionHeader
          title="Transactions"
          subtitle={status === 'Exhausted' ? `${rows.length} total · newest first` : 'Newest first'}
        />
      </View>
      {status === 'LoadingFirstPage' ? (
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      ) : rows.length === 0 ? (
        <StateMessage title="No transactions" body="Nothing has been recorded for this account yet." />
      ) : (
        groups.map((group) => (
          <View key={group.date}>
            <View style={[styles.dateHeader, { backgroundColor: palette.cardAlt, borderColor: palette.hairline }]}>
              <FText variant="eyebrow" tone="subtle">
                {formatCoverageDate(group.date)}
              </FText>
            </View>
            {group.rows.map((row, index) => {
              const signed = displayAmount(row.amount, row.direction);
              return (
                <Fragment key={row._id}>
                  {index > 0 ? <Divider inset={16} /> : null}
                  <View style={styles.txRow}>
                    <View style={styles.flex}>
                      <FText variant="body" numberOfLines={1} style={styles.txTitle}>
                        {row.description}
                      </FText>
                      <View style={styles.txMeta}>
                        {row.category ? <Badge label={row.category} /> : null}
                        {row.pending ? <Badge label="Pending" tone="warning" /> : null}
                      </View>
                    </View>
                    <FText
                      variant="body"
                      tone={signed > 0 ? 'positive' : 'text'}
                      style={[styles.strong, TABULAR, row.pending && styles.pending]}>
                      {signed > 0 ? '+' : signed < 0 ? '−' : ''}
                      {formatUsd(Math.abs(signed))}
                    </FText>
                  </View>
                </Fragment>
              );
            })}
          </View>
        ))
      )}
      {status === 'CanLoadMore' || status === 'LoadingMore' ? (
        <Pressable
          accessibilityRole="button"
          onPress={onLoadMore}
          disabled={status === 'LoadingMore'}
          style={(state) => [
            styles.loadMore,
            { borderTopColor: palette.hairline },
            state.pressed && { backgroundColor: palette.pressed },
          ]}>
          {status === 'LoadingMore' ? (
            <ActivityIndicator />
          ) : (
            <FText variant="callout" tone="accent" style={styles.strong}>
              Show more transactions
            </FText>
          )}
        </Pressable>
      ) : null}
    </Card>
  );
}

export type DetailField = { label: string; value: string; mono?: boolean };

export function DetailsCard({ fields }: { fields: DetailField[] }) {
  const { width } = useWindowDimensions();
  const columns = width >= 720 ? 2 : 1;
  return (
    <Card padded={false}>
      <View style={styles.cardHeader}>
        <SectionHeader title="Account details" />
      </View>
      <View style={styles.fieldGrid}>
        {fields.map((field, index) => (
          <View
            key={field.label}
            style={[styles.field, { width: columns === 2 ? '50%' : '100%' }]}>
            {index >= columns ? <Divider /> : null}
            <View style={styles.fieldInner}>
              <FText variant="callout" tone="muted">
                {field.label}
              </FText>
              <FText
                variant={field.mono ? 'mono' : 'callout'}
                style={[styles.fieldValue, TABULAR]}
                selectable
                numberOfLines={2}>
                {field.value}
              </FText>
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

export function accountFields(detail: {
  sourceId: string;
  institution: string;
  typeLabel: string;
  class: string;
  mask: string | null;
  currency: string;
  currentBalance: number;
  availableBalance: number | null;
  latestSnapshot: { asOf: string; balance: number; source: string } | null;
  coverageStart: string | null;
  syncedAt: number;
  updatedAt: number;
  provider: string;
  connectionId: string | null;
}): DetailField[] {
  const when = (ms: number) =>
    new Date(ms).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  const fields: DetailField[] = [
    { label: 'Institution', value: detail.institution },
    { label: 'Type', value: detail.typeLabel },
    { label: 'Class', value: classLabel(detail.class) },
    { label: 'Account number', value: detail.mask ? `•••• ${detail.mask}` : '—' },
    { label: 'Current balance', value: formatUsd(detail.currentBalance) },
    {
      label: 'Available balance',
      value: detail.availableBalance != null ? formatUsd(detail.availableBalance) : '—',
    },
    { label: 'Currency', value: detail.currency },
    {
      label: 'Latest snapshot',
      value: detail.latestSnapshot
        ? `${formatCoverageDate(detail.latestSnapshot.asOf)} · ${detail.latestSnapshot.source}`
        : '—',
    },
    {
      label: 'History starts',
      value: detail.coverageStart ? formatCoverageDate(detail.coverageStart) : '—',
    },
    { label: 'Last synced', value: when(detail.syncedAt) },
    { label: 'Record updated', value: when(detail.updatedAt) },
    { label: 'Provider', value: detail.provider },
  ];
  if (detail.connectionId) fields.push({ label: 'Connection', value: detail.connectionId });
  fields.push({ label: 'Account ID', value: detail.sourceId, mono: true });
  return fields;
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  right: { alignItems: 'flex-end', gap: 2 },
  strong: { fontWeight: '600' },
  pending: { opacity: 0.6 },
  cardHeader: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  allocation: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 },
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  colSymbol: { flex: 1.6 },
  colNum: { flex: 1, textAlign: 'right' },
  colPct: { flex: 0.8, textAlign: 'right' },
  symbolCell: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  swatch: { width: 4, height: 28, borderRadius: 2 },
  holdingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  loading: { paddingVertical: 32, alignItems: 'center' },
  dateHeader: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11 },
  txTitle: { fontWeight: '500' },
  txMeta: { flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  loadMore: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
  },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingBottom: 4 },
  field: {},
  fieldInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  fieldValue: { flexShrink: 1, textAlign: 'right', fontWeight: '500' },
});
