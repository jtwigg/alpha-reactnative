import { useRouter, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Card, Divider, FText } from '@/components/finance/ui';
import { MAX_CONTENT_WIDTH, useAppPalette } from '@/lib/app-theme';
import { SETTINGS_SECTIONS } from '@/lib/plaid-status';

export default function SettingsScreen() {
  const palette = useAppPalette();
  const router = useRouter();
  return (
    <ScrollView
      style={{ backgroundColor: palette.page }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic">
      <View style={styles.column}>
        <FText variant="eyebrow" tone="muted">
          Settings
        </FText>
        <Card>
          {SETTINGS_SECTIONS.map((section, index) => (
            <View key={section.href}>
              {index > 0 ? <Divider /> : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(section.href as Href)}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: palette.pressed }]}>
                <FText variant="headline">{section.title}</FText>
                <FText variant="callout" tone="muted">
                  {section.body}
                </FText>
              </Pressable>
            </View>
          ))}
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, alignItems: 'center' },
  column: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, gap: 14 },
  row: { padding: 14, gap: 2 },
});
