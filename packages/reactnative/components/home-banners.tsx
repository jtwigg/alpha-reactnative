import { useQuery } from 'convex/react';
import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { FText } from '@/components/finance/ui';
import { api } from '@/lib/api';
import { CARD_CHROME, useAppPalette } from '@/lib/app-theme';
import { formatUsd, formatUsdSigned } from '@/lib/finance-coverage';
import { DEFAULT_CHART_RANGE, overviewPageArgs } from '@/lib/finance-prefetch';
import { plaidBannerLabel, type PlaidOverview } from '@/lib/plaid-status';
import { useFinancePrefetch } from '@/providers/finance-prefetch';

export function briefingItemCount(row: {
  personalPriorities: number;
  crankcasePriorities: number;
  personalGlance?: number;
  crankcaseGlance?: number;
} | null | undefined): number {
  if (!row) return 0;
  return (
    row.personalPriorities +
    row.crankcasePriorities +
    (row.personalGlance ?? 0) +
    (row.crankcaseGlance ?? 0)
  );
}

export function briefingBannerLabel(count: number): string {
  if (count <= 0) return 'No new emails';
  if (count === 1) return '1 new email';
  return `${count} new emails`;
}

export function HomeBriefingBanner({ ready }: { ready: boolean }) {
  const palette = useAppPalette();
  const router = useRouter();
  const allowed = useQuery(api.briefings.queries.isAllowed, ready ? {} : 'skip');
  const dates = useQuery(api.briefings.queries.listDates, allowed ? {} : 'skip');
  if (!ready || allowed === false) return null;
  const count = briefingItemCount(dates?.[0]);
  const loading = allowed === undefined || dates === undefined;
  return (
    <Pressable
      onPress={() => router.push('/briefings' as Href)}
      accessibilityRole="button"
      accessibilityLabel="Open Briefings"
      style={({ pressed }) => [
        CARD_CHROME,
        styles.banner,
        { backgroundColor: palette.card, borderColor: palette.border, shadowColor: palette.shadow },
        pressed && { backgroundColor: palette.pressed },
      ]}>
      <View style={styles.row}>
        <FText variant="eyebrow" tone="muted">
          Briefings
        </FText>
        <FText variant="headline">{loading ? 'Checking mail…' : briefingBannerLabel(count)}</FText>
      </View>
    </Pressable>
  );
}

export function HomeFinanceBanner({ ready }: { ready: boolean }) {
  const palette = useAppPalette();
  const router = useRouter();
  const prefetch = useFinancePrefetch();
  const liveAllowed = useQuery(api.finance.queries.isAllowed, ready && prefetch.allowed === undefined ? {} : 'skip');
  const allowed = prefetch.allowed ?? liveAllowed;
  const cached = prefetch.overview(DEFAULT_CHART_RANGE) as
    | { headline?: number; change?: number }
    | undefined;
  const live = useQuery(
    api.finance.queries.page,
    overviewPageArgs({
      allowed: Boolean(ready && allowed),
      range: DEFAULT_CHART_RANGE,
      cache: prefetch.cache,
      refreshNonce: prefetch.refreshNonce,
    }),
  ) as { headline?: number; change?: number } | undefined;
  const page = cached ?? live;
  if (!ready || allowed === false) return null;
  const line =
    page && typeof page.headline === 'number'
      ? `${formatUsd(page.headline)}${
          typeof page.change === 'number' ? ` · ${formatUsdSigned(page.change)}` : ''
        }`
      : allowed === undefined || page == null
        ? 'Opening Finances…'
        : 'Net worth';
  return (
    <Pressable
      onPress={() => router.push('/finances' as Href)}
      accessibilityRole="button"
      accessibilityLabel="Open Finances"
      style={({ pressed }) => [
        CARD_CHROME,
        styles.banner,
        { backgroundColor: palette.card, borderColor: palette.border, shadowColor: palette.shadow },
        pressed && { backgroundColor: palette.pressed },
      ]}>
      <View style={styles.row}>
        <FText variant="eyebrow" tone="muted">
          Finances
        </FText>
        <FText variant="headline" style={styles.tabular}>
          {line}
        </FText>
      </View>
    </Pressable>
  );
}

/** Entry point to Connections: attention items, "Link a bank", or a connected count. */
export function HomePlaidBanner({ ready }: { ready: boolean }) {
  const palette = useAppPalette();
  const router = useRouter();
  const allowed = useQuery(api.finance.queries.isAllowed, ready ? {} : 'skip');
  const overview = useQuery(api.plaid.store.listConnections, ready && allowed ? {} : 'skip') as
    | PlaidOverview
    | undefined;
  const label = plaidBannerLabel(overview);
  if (!label) return null;
  return (
    <Pressable
      onPress={() => router.push('/connections' as Href)}
      accessibilityRole="button"
      accessibilityLabel="Open Connections"
      style={({ pressed }) => [
        CARD_CHROME,
        styles.banner,
        { backgroundColor: palette.card, borderColor: palette.border, shadowColor: palette.shadow },
        pressed && { backgroundColor: palette.pressed },
      ]}>
      <View style={styles.row}>
        <FText variant="eyebrow" tone="muted">
          Connections
        </FText>
        <FText variant="headline">{label}</FText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  row: { gap: 2 },
  tabular: { fontVariant: ['tabular-nums'] },
});
