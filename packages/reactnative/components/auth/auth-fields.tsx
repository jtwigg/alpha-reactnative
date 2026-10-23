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
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      style={[styles.button, (disabled || loading) && styles.buttonDisabled]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={styles.buttonText}>{title}</Text>
      )}
    </Pressable>
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
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  errorBox: {
    backgroundColor: '#fdecea',
    borderRadius: 10,
    padding: 12,
  },
  errorText: { color: '#b42318', fontSize: 14 },
});
