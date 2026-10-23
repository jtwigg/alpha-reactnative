import { AuthButton, AuthError } from '@/components/auth/auth-fields';
import { useGoogleSso } from '@/hooks/use-google-sso';

export function GoogleButton() {
  const { continueWithGoogle, loading, error, ready } = useGoogleSso();

  return (
    <>
      <AuthButton
        title="Continue with Google"
        variant="google"
        onPress={continueWithGoogle}
        loading={loading}
        disabled={!ready}
      />
      <AuthError message={error} />
    </>
  );
}
