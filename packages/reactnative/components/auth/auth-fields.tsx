import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function AuthInput({
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  autoComplete,
  keyboardType,
  editable = true,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  autoComplete?: 'email' | 'password' | 'one-time-code' | 'name' | 'off';
  keyboardType?: 'email-address' | 'default' | 'number-pad';
  editable?: boolean;
}) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  return (
    <TextInput
      style={[
        styles.input,
        {
          color: colors.text,
          borderColor: colorScheme === 'dark' ? '#333' : '#ddd',
          backgroundColor: colorScheme === 'dark' ? '#1f2123' : '#f7f7f7',
        },
      ]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.icon}
      secureTextEntry={secureTextEntry}
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete={autoComplete}
      keyboardType={keyboardType}
      editable={editable}
      textContentType={
        secureTextEntry ? 'password' : keyboardType === 'email-address' ? 'emailAddress' : undefined
      }
    />
  );
}

export function AuthButton({
  title,
  onPress,
  disabled,
  loading,
  variant = 'primary',
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'google';
}) {
  const isGoogle = variant === 'google';
  return (
    <Pressable
      style={[
        styles.button,
        isGoogle && styles.googleButton,
        (disabled || loading) && styles.buttonDisabled,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      {loading ? (
        <ActivityIndicator color={isGoogle ? '#1f1f1f' : '#fff'} />
      ) : (
        <Text style={[styles.buttonText, isGoogle && styles.googleButtonText]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function AuthDivider() {
  return (
    <View style={styles.dividerRow}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerText}>or</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#0a7ea4',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  googleButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dadce0',
  },
  googleButtonText: { color: '#1f1f1f' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: '#c5c5c5' },
  dividerText: { color: '#687076', fontSize: 14 },
  errorBox: {
    backgroundColor: '#fdecea',
    borderRadius: 10,
    padding: 12,
  },
  errorText: { color: '#b42318', fontSize: 14 },
});
