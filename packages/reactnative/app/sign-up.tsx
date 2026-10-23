import { MissingConfig } from '@/components/auth/missing-config';
import { SignUpForm } from '@/components/auth/sign-up-form';
import { isClerkConfigured } from '@/lib/convex';

export default function SignUpScreen() {
  if (!isClerkConfigured()) {
    return <MissingConfig />;
  }
  return <SignUpForm />;
}
