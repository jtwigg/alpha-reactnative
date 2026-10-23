import { useAuth, useSignUp } from '@clerk/expo';
import { Link, Redirect } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AuthButton, AuthDivider, AuthError, AuthInput } from '@/components/auth/auth-fields';
import { AuthLayout } from '@/components/auth/auth-layout';
import { GoogleButton } from '@/components/auth/google-button';
import { ThemedText } from '@/components/themed-text';
import { getClerkErrorMessage } from '@/lib/convex';

export function SignUpForm() {
  const { isSignedIn } = useAuth();
  const { signUp, errors, fetchStatus } = useSignUp();
  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loading = fetchStatus === 'fetching';

  const handleSubmit = async () => {
    if (!signUp) return;
    setFormError(null);
    try {
      const { error } = await signUp.password({ emailAddress, password });
      if (error) {
        setFormError(getClerkErrorMessage(error));
        return;
      }
      const { error: sendError } = await signUp.verifications.sendEmailCode();
      if (sendError) {
        setFormError(getClerkErrorMessage(sendError));
        return;
      }
      setIsVerifying(true);
    } catch (error) {
      setFormError(getClerkErrorMessage(error));
    }
  };

  const handleVerify = async () => {
    if (!signUp) return;
    setFormError(null);
    try {
      const { error } = await signUp.verifications.verifyEmailCode({ code });
      if (error) {
        setFormError(getClerkErrorMessage(error));
        return;
      }
      await signUp.finalize();
    } catch (error) {
      setFormError(getClerkErrorMessage(error));
    }
  };

  if (isSignedIn) {
    return <Redirect href="/" />;
  }

  if (isVerifying) {
    return (
      <AuthLayout
        title="Verify your email"
        subtitle="Enter the code Clerk emailed you to create your account."
      >
        <AuthInput
          value={code}
          onChangeText={setCode}
          placeholder="Verification code"
          keyboardType="number-pad"
          autoComplete="one-time-code"
          editable={!loading}
        />
        <AuthError message={formError ?? errors?.fields?.code?.message ?? null} />
        <AuthButton title="Verify email" onPress={handleVerify} loading={loading} disabled={!code} />
        <View nativeID="clerk-captcha" />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create account"
      subtitle="Continue with Google or use email and password. Email sign-up sends a verification code."
    >
      <GoogleButton />
      <AuthDivider />
      <View style={styles.fields}>
        <AuthInput
          value={emailAddress}
          onChangeText={setEmailAddress}
          placeholder="Email"
          keyboardType="email-address"
          autoComplete="email"
          editable={!loading}
        />
        <AuthInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          secureTextEntry
          autoComplete="password"
          editable={!loading}
        />
      </View>
      <AuthError
        message={
          formError ??
          errors?.fields?.emailAddress?.message ??
          errors?.fields?.password?.message ??
          null
        }
      />
      <AuthButton
        title="Sign up"
        onPress={handleSubmit}
        loading={loading}
        disabled={!emailAddress || !password}
      />
      <Link href="/sign-in" style={styles.link}>
        <ThemedText type="link">Already have an account? Sign in</ThemedText>
      </Link>
      {/* Required for sign-up on Expo web if Clerk uses legacy bot protection. */}
      <View nativeID="clerk-captcha" />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  fields: { gap: 12 },
  link: { alignSelf: 'center', paddingVertical: 8 },
});
