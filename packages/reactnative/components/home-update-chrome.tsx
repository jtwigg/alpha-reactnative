import { useQuery } from 'convex/react';
import * as Updates from 'expo-updates';
import { Component, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { api } from '@/lib/api';
import {
  applyOtaUpdate,
  openTestFlight,
  otaBuildFromManifest,
  pickUpdatePrompt,
  updateBannerCopy,
  type UpdatePrompt,
} from '@/lib/app-update';
import { jsVersionLabel } from '@/lib/app-version';
import { currentNativeBuildVersion } from '@/lib/native-build';

class SoftQueryBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Small muted stamp. Always visible under the header — not behind the composer. */
export function VersionLabel({ label = jsVersionLabel() }: { label?: string }) {
  return (
    <Text accessibilityRole="text" accessibilityLabel={label} style={styles.label}>
      {label}
    </Text>
  );
}

export function UpdateBannerView({
  text,
  onPress,
  onDismiss,
  busy,
}: {
  text: string;
  onPress: () => void;
  onDismiss: () => void;
  busy?: boolean;
}) {
  return (
    <View style={styles.banner} accessibilityRole="alert" accessibilityLabel={text}>
      <Pressable
        onPress={onPress}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={text}
        style={({ pressed }) => [styles.bannerTap, pressed && styles.pressed]}>
        <Text style={styles.bannerText}>{text}</Text>
      </Pressable>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss update banner"
        hitSlop={8}
        style={styles.dismiss}>
        <Text style={styles.dismissText}>Dismiss</Text>
      </Pressable>
    </View>
  );
}

export function HomeUpdateBanner({
  prompt,
  availableOta,
  busy,
  onPress,
}: {
  prompt: UpdatePrompt;
  availableOta?: number | null;
  busy?: boolean;
  onPress: () => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  const text = updateBannerCopy(prompt, { availableOta, busy });
  if (!text || dismissed) return null;
  return (
    <UpdateBannerView
      text={text}
      busy={busy}
      onPress={onPress}
      onDismiss={() => setDismissed(true)}
    />
  );
}

function BannerInner({
  release,
}: {
  release: { latestBuildNumber?: string | null; testflightUrl?: string | null } | null | undefined;
}) {
  const nativeBuild = useMemo(() => currentNativeBuildVersion(), []);
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
  const availableOta = otaBuildFromManifest(updates.availableUpdate?.manifest ?? updates.downloadedUpdate?.manifest);

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

  return (
    <HomeUpdateBanner
      prompt={prompt}
      availableOta={availableOta}
      busy={busy || updates.isDownloading}
      onPress={() => void handlePress()}
    />
  );
}

function BannerWithRelease() {
  const release = useQuery(api.app.release.latest);
  return <BannerInner release={release} />;
}

/** Top-of-Home update banner. Soft-fails if Convex `app_release` is down; OTA prompt still works. */
export function HomeUpdateBannerHost() {
  return (
    <SoftQueryBoundary fallback={<BannerInner release={null} />}>
      <BannerWithRelease />
    </SoftQueryBoundary>
  );
}

const styles = StyleSheet.create({
  label: {
    marginHorizontal: 20,
    marginTop: 2,
    marginBottom: 6,
    fontSize: 13,
    lineHeight: 18,
    color: '#6b7280',
  },
  banner: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#11181C',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bannerTap: { flex: 1 },
  bannerText: { color: '#fff', fontSize: 14, lineHeight: 19, fontWeight: '600' },
  dismiss: { paddingHorizontal: 4, paddingVertical: 2 },
  dismissText: { color: '#cbd5e1', fontSize: 13, fontWeight: '600' },
  pressed: { opacity: 0.75 },
});
