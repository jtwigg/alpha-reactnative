import { useRouter, type Href } from 'expo-router';
import { Fragment } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

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
import { IconSymbol } from '@/components/ui/icon-symbol';
import { formatCoverageDate, formatUsd } from '@/lib/finance-coverage';
import type {
  AccountGroup,
  AccountGroupKey,
  AccountListModel,
  AccountListRow,
} from '../../../server/convex/finance/accountModel';

export const GROUP_COLORS: Record<AccountGroupKey, string> = {
  cash: '#16a34a',
  investments: '#0a7ea4',
  real_estate: '#7c3aed',
  liability: '#c2410c',
  other: '#64748b',
};

export function accountHref(sourceId: string, demo: boolean): Href {
  const base = `/finances/account/${encodeURIComponent(sourceId)}`;
  return (demo ? `${base}?demo=1` : base) as Href;
}

export function AccountGroups({ model, demo }: { model: AccountListModel; demo: boolean }) {
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
        <GroupCard key={group.key} group={group} demo={demo} />
      ))}
    </View>
  );
}

function GroupCard({ group, demo }: { group: AccountGroup; demo: boolean }) {
  const palette = useFinancePalette();
  const color = GROUP_COLORS[group.key];
  return (
    <Card padded={false}>
      <View style={[styles.groupHeader, { backgroundColor: palette.cardAlt, borderBottomColor: palette.hairline }]}>
        <View style={styles.groupTitle}>
          <View style={[styles.groupDot, { backgroundColor: color }]} />
          <FText variant="eyebrow" tone="muted">
            {group.label}
          </FText>
          <FText variant="caption" tone="subtle">
            {group.count} {group.count === 1 ? 'account' : 'accounts'}
          </FText>
        </View>
        <FText
          variant="headline"
          tone={group.subtotal < 0 ? 'negative' : 'text'}
          style={TABULAR}
          accessibilityLabel={`${group.label} subtotal`}>
          {formatUsd(group.subtotal)}
        </FText>
      </View>
      {group.accounts.map((account, index) => (
        <Fragment key={account.sourceId}>
          {index > 0 ? <Divider inset={66} /> : null}
          <AccountRow account={account} color={color} demo={demo} />
        </Fragment>
      ))}
    </Card>
  );
}

function AccountRow({ account, color, demo }: { account: AccountListRow; color: string; demo: boolean }) {
  const router = useRouter();
  const palette = useFinancePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${account.name}, ${formatUsd(account.signedBalance)}`}
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
          {account.mask ? (
            <FText variant="caption" tone="subtle">
              ••{account.mask}
            </FText>
          ) : null}
        </View>
        <View style={styles.rowMeta}>
          <FText variant="caption" tone="muted" numberOfLines={1} style={styles.metaText}>
            {account.institution} · {account.type}
          </FText>
          {account.isManual ? <Badge label="Manual" /> : null}
        </View>
      </View>
      <View style={styles.rowRight}>
        <FText
          variant="body"
          tone={account.signedBalance < 0 ? 'negative' : 'text'}
          style={[styles.balance, TABULAR]}>
          {formatUsd(account.signedBalance)}
        </FText>
        <FText variant="caption" tone="subtle">
          {formatCoverageDate(account.lastUpdated)}
        </FText>
      </View>
      <IconSymbol name="chevron.right" size={18} color={palette.subtle} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  groups: { gap: 14 },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  groupTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
});
