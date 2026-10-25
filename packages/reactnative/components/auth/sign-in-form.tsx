import { useAuth, useSignIn } from '@clerk/expo';
import { Link, Redirect, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AuthButton, AuthDivider, AuthError, AuthInput } from '@/components/auth/auth-fields';
import { AuthLayout } from '@/components/auth/auth-layout';
import { GoogleButton } from '@/components/auth/google-button';
import { ThemedText } from '@/components/themed-text';
import { safeReturnPath } from '@/lib/app-links';
import { getClerkErrorMessage } from '@/lib/convex';
import { captureAuthException, logAuth } from '@/lib/sentry';

export function SignInForm() {
  const { isSignedIn } = useAuth();
  const { signIn, errors, fetchStatus } = useSignIn();
  const params = useLocalSearchParams<{ return?: string }>();
  const afterSignIn = (safeReturnPath(params.return) ?? '/') as Href;
  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [needsTrust, setNeedsTrust] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loading = fetchStatus === 'fetching';

  const handleSubmit = async () => {
    if (!signIn) return;
    setFormError(null);
    logAuth('auth.sign_in_button_pressed', { strategy: 'password' });
    try {
      const { error } = await signIn.password({ emailAddress, password });
      if (error) {
        captureAuthException(error, { strategy: 'password' });
        setFormError(getClerkErrorMessage(error));
        return;
      }
      if (signIn.status === 'complete') {
        await signIn.finalize();
        return;
      }
      if (signIn.status === 'needs_client_trust' || signIn.status === 'needs_second_factor') {
        const emailCodeFactor = signIn.supportedSecondFactors.find(
          (factor) => factor.strategy === 'email_code',
        );
        if (emailCodeFactor) {
          await signIn.mfa.sendEmailCode();
        }
        setNeedsTrust(true);
        return;
      }
      setFormError('Sign-in needs another step. Check email verification in the Clerk dashboard.');
    } catch (error) {
      captureAuthException(error, { strategy: 'password' });
      setFormError(getClerkErrorMessage(error));
    }
  };

  const handleVerify = async () => {
    if (!signIn) return;
    setFormError(null);
    try {
      await signIn.mfa.verifyEmailCode({ code });
      if (signIn.status === 'complete') {
        await signIn.finalize();
      }
    } catch (error) {
      captureAuthException(error, { strategy: 'email_code' });
      setFormError(getClerkErrorMessage(error));
    }
  };

  if (isSignedIn) {
    return <Redirect href={afterSignIn} />;
  }

  if (needsTrust) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle="Enter the verification code Clerk sent you to finish signing in."
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
        <AuthButton title="Verify" onPress={handleVerify} loading={loading} disabled={!code} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Sign in" subtitle="Welcome back. Continue with Google or use email and password.">
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
          errors?.fields?.identifier?.message ??
          errors?.fields?.password?.message ??
          null
        }
      />
      <AuthButton
        title="Sign in"
        onPress={handleSubmit}
        loading={loading}
        disabled={!emailAddress || !password}
      />
      <Link href="/sign-up" style={styles.link}>
        <ThemedText type="link">Need an account? Sign up</ThemedText>
      </Link>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  fields: { gap: 12 },
  link: { alignSelf: 'center', paddingVertical: 8 },
});
