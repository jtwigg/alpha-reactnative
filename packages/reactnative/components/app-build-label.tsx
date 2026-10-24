import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Updates from 'expo-updates';

import { ThemedText } from '@/components/themed-text';
import { formatBuildDetail, jsVersionLabel, type UpdateMeta } from '@/lib/app-version';

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

/** Plainly visible JS / OTA stamp for confirming a phone picked up an update. */
export function AppBuildLabel() {
  const meta = useMemo(readUpdateMeta, []);
  const js = jsVersionLabel();
  const detail = formatBuildDetail(meta);
  return (
    <View
      style={styles.wrap}
      accessibilityRole="summary"
      accessibilityLabel={`${js}. ${detail}`}>
      <ThemedText type="defaultSemiBold" style={styles.js}>
        {js}
      </ThemedText>
      <ThemedText style={styles.detail}>{detail}</ThemedText>
    </View>
  );
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
});
