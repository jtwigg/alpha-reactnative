import { MissingConfig } from '@/components/auth/missing-config';
import { SignInForm } from '@/components/auth/sign-in-form';
import { isClerkConfigured } from '@/lib/convex';

export default function SignInScreen() {
  if (!isClerkConfigured()) {
    return <MissingConfig />;
  }
  return <SignInForm />;
}
