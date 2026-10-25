import { useQuery } from 'convex/react';
import * as Updates from 'expo-updates';
import { Component, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { api } from '@/lib/api';
import {
  applyOtaUpdate,
  openTestFlight,
  pickUpdatePrompt,
  updatePromptLabel,
} from '@/lib/app-update';
import { formatBuildDetail, jsVersionLabel, type UpdateMeta } from '@/lib/app-version';
import { currentNativeBuildVersion } from '@/lib/native-build';

function readUpdateMeta(): UpdateMeta {
  try {
    const updateId = Updates.updateId ?? null;
    return {
      updateId,
      createdAt: Updates.createdAt ?? null,
      embedded: Updates.isEmbeddedLaunch || !updateId,
    };
  } catch {
    return { updateId: null, createdAt: null, embedded: true };
  }
}

class SoftQueryBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Stamp({
  pill,
  onPress,
  busy,
}: {
  pill?: string | null;
  onPress?: () => void;
  busy?: boolean;
}) {
  const meta = useMemo(readUpdateMeta, []);
  const js = jsVersionLabel();
  const detail = formatBuildDetail(meta);
  return (
    <View
      style={styles.wrap}
      accessibilityRole="summary"
      accessibilityLabel={`${js}. ${detail}${pill ? `. ${pill}` : ''}`}>
      <ThemedText type="defaultSemiBold" style={styles.js}>
        {js}
      </ThemedText>
      <ThemedText style={styles.detail}>{detail}</ThemedText>
      {pill ? (
        <Pressable
          onPress={onPress}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={pill}
          style={({ pressed }) => [styles.pill, pressed && styles.pillPressed, busy && styles.pillBusy]}>
          <ThemedText style={styles.pillText}>{pill}</ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Plainly visible JS / OTA stamp, plus native-build and OTA pills. */
export function AppBuildLabel() {
  return (
    <SoftQueryBoundary fallback={<Stamp />}>
      <AppBuildLabelInner />
    </SoftQueryBoundary>
  );
}

function AppBuildLabelInner() {
  const nativeBuild = useMemo(() => currentNativeBuildVersion(), []);
  const release = useQuery(api.app.release.latest);
  const updates = Updates.useUpdates();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!Updates.isEnabled) return;
    void Updates.checkForUpdateAsync().catch(() => undefined);
  }, []);

  const prompt = pickUpdatePrompt({
    currentBuild: nativeBuild,
    latestBuild: release?.latestBuildNumber ?? null,
    otaAvailable: Boolean(Updates.isEnabled && updates.isUpdateAvailable),
    otaPending: Boolean(Updates.isEnabled && updates.isUpdatePending),
  });
  const pill = updatePromptLabel(prompt, busy || updates.isDownloading || updates.isChecking);

  const handlePress = async () => {
    if (!prompt || busy) return;
    if (prompt.kind === 'native') {
      await openTestFlight((url) => Linking.openURL(url), release?.testflightUrl);
      return;
    }
    setBusy(true);
    try {
      await applyOtaUpdate(
        {
          isEnabled: Updates.isEnabled,
          checkForUpdateAsync: () => Updates.checkForUpdateAsync(),
          fetchUpdateAsync: () => Updates.fetchUpdateAsync(),
          reloadAsync: () => Updates.reloadAsync(),
        },
        updates.isUpdatePending,
      );
    } finally {
      setBusy(false);
    }
  };

  return <Stamp pill={pill} onPress={() => void handlePress()} busy={busy} />;
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#c5c5c5',
    gap: 2,
  },
  js: { fontSize: 16, lineHeight: 22 },
  detail: { fontSize: 14, lineHeight: 20, opacity: 0.75 },
  pill: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#0a7ea4',
  },
  pillPressed: { opacity: 0.75 },
  pillBusy: { opacity: 0.6 },
  pillText: { color: '#fff', fontSize: 13, lineHeight: 18, fontWeight: '600' },
});
