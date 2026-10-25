import { Link, type Href } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

const PAGE = '#f7f7f4';
const TEXT = '#1f2430';
const MUTED = '#6b7280';
const ACCENT = '#0a7ea4';

export function LinkNotFound({
  title = 'Not found',
  body = 'That link does not match anything in Alpha.',
  href = '/',
  label = 'Go home',
}: {
  title?: string;
  body?: string;
  href?: Href;
  label?: string;
}) {
  return (
    <View style={styles.page} accessibilityRole="alert">
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      <Link href={href} style={styles.link} accessibilityRole="link">
        {label}
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: PAGE,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
  },
  title: { color: TEXT, fontSize: 22, fontWeight: '700' },
  body: { color: MUTED, fontSize: 15, textAlign: 'center', maxWidth: 360 },
  link: { color: ACCENT, fontSize: 16, fontWeight: '600', marginTop: 8 },
});
