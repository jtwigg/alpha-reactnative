import * as WebBrowser from 'expo-web-browser';
WebBrowser.maybeCompleteAuthSession();

import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AuthLayout } from '@/components/auth/auth-layout';

export default function SsoCallbackScreen() {
  return (
    <AuthLayout
      title="Finishing sign-in"
      subtitle="One moment while we complete Google sign-in."
    >
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', paddingVertical: 16 },
});
