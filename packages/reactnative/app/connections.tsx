import { useAction, useQuery } from 'convex/react';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Badge, Card, Divider, FText, StateMessage } from '@/components/finance/ui';
import { api } from '@/lib/api';
import { MAX_CONTENT_WIDTH, useAppPalette } from '@/lib/app-theme';
import { openPlaidLink } from '@/lib/plaid-link';
import {
  lastSyncedLabel,
  plaidStatusLabel,
  type PlaidConnection,
  type PlaidOverview,
} from '@/lib/plaid-status';

export default function ConnectionsScreen() {
  const palette = useAppPalette();
  const overview = useQuery(api.plaid.store.listConnections, {}) as PlaidOverview | undefined;
  const createLinkToken = useAction(api.plaid.link.createLinkToken);
  const createUpdateLinkToken = useAction(api.plaid.link.createUpdateLinkToken);
  const exchangePublicToken = useAction(api.plaid.link.exchangePublicToken);
  const markRelinked = useAction(api.plaid.link.markRelinked);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const run = useCallback(async (key: string, task: () => Promise<string | null>) => {
    setBusy(key);
    setMessage(null);
    try {
      setMessage(await task());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  }, []);

  const linkNew = () =>
    run('new', async () => {
      const { linkToken } = await createLinkToken({});
      const publicToken = await openPlaidLink(linkToken);
      if (!publicToken) return null;
      const { institutionName } = await exchangePublicToken({ publicToken });
      return `Linked ${institutionName ?? 'institution'}. It starts in shadow mode.`;
    });

  const relink = (item: PlaidConnection) =>
    run(item.plaidItemId, async () => {
      const { linkToken } = await createUpdateLinkToken({ plaidItemId: item.plaidItemId });
      const publicToken = await openPlaidLink(linkToken);
      if (!publicToken) return null;
      // Update mode needs no token exchange; the item is the same one.
      await markRelinked({ plaidItemId: item.plaidItemId });
      return `Relinked ${item.institutionName}.`;
    });

  if (overview === undefined) {
    return <StateMessage title="Loading connections…" />;
  }

  return (
    <ScrollView
      style={{ backgroundColor: palette.page }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic">
      <View style={styles.column}>
        <FText variant="eyebrow" tone="muted">
          Connections
        </FText>
        {overview.items.length === 0 ? (
          <StateMessage
            title="No banks linked"
            body="Link a bank or brokerage to start Plaid syncing in shadow mode."
          />
        ) : (
          <Card>
            {overview.items.map((item, index) => (
              <View key={item.plaidItemId}>
                {index > 0 ? <Divider /> : null}
                <View style={styles.row}>
                  <View style={styles.rowText}>
                    <FText variant="headline">{item.institutionName}</FText>
                    <FText variant="caption" tone="muted">
                      {lastSyncedLabel(item.lastSyncedAt)}
                      {item.lastError ? ` · ${item.lastError}` : ''}
                    </FText>
                  </View>
                  <Badge
                    label={plaidStatusLabel(item)}
                    tone={item.status === 'active' ? 'muted' : 'warning'}
                  />
                  {item.status !== 'active' ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={busy !== null}
                      onPress={() => relink(item)}
                      style={[styles.button, { borderColor: palette.border }]}>
                      <FText variant="callout" tone="accent">
                        {busy === item.plaidItemId ? '…' : 'Relink'}
                      </FText>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
          </Card>
        )}
        {overview.openDeletionProposals > 0 ? (
          <FText variant="callout" tone="muted">
            {overview.openDeletionProposals} proposed deletion
            {overview.openDeletionProposals === 1 ? '' : 's'} waiting for your review.
          </FText>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={busy !== null}
          onPress={linkNew}
          style={[styles.primary, { backgroundColor: palette.accent, opacity: busy ? 0.6 : 1 }]}>
          <FText variant="headline" style={{ color: '#FFFFFF' }}>
            {busy === 'new' ? 'Opening…' : 'Link a bank'}
          </FText>
        </Pressable>
        {message ? (
          <FText variant="callout" tone="muted">
            {message}
          </FText>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, alignItems: 'center' },
  column: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  rowText: { flex: 1, gap: 2 },
  button: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  primary: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
});
