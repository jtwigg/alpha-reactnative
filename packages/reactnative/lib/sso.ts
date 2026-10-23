import * as AuthSession from 'expo-auth-session';

export const APP_SCHEME = 'johnsapp';
export const SSO_CALLBACK_PATH = 'sso-callback';

/** Paths Clerk's web redirect flow uses. Relative so they work on any origin. */
export const WEB_SSO_REDIRECT_URL = '/sso-callback';
export const WEB_SSO_COMPLETE_URL = '/';

export const SIGN_IN_NEEDS_SIGN_UP_MESSAGE =
  "Google sign-in needs to create or link an account, but this Clerk instance has restricted sign-ups. If you already have an account (john.twigg@gmail.com), sign in with email and password instead. An admin can complete the Google account transfer in the Clerk dashboard — this app will not auto-create accounts.";

/** Native: johnsapp://sso-callback. Web native-SSO fallback: current origin + /sso-callback. */
export function getSsoRedirectUrl() {
  return AuthSession.makeRedirectUri({
    scheme: APP_SCHEME,
    path: SSO_CALLBACK_PATH,
  });
}

function readStatus(resource: unknown): string | null {
  if (!resource || typeof resource !== 'object') return null;
  const status = (resource as { status?: unknown }).status;
  return typeof status === 'string' ? status : null;
}

function readVerificationStatus(resource: unknown): string | null {
  if (!resource || typeof resource !== 'object') return null;
  const verification = (resource as { firstFactorVerification?: { status?: unknown } })
    .firstFactorVerification;
  return typeof verification?.status === 'string' ? verification.status : null;
}

export function isSignInTransferable(signIn: unknown): boolean {
  if (!signIn || typeof signIn !== 'object') return false;
  if ((signIn as { isTransferable?: unknown }).isTransferable === true) return true;
  return readVerificationStatus(signIn) === 'transferable';
}

export function getSignInNeedsSignUpMessage(
  signIn: unknown,
  signUp: unknown,
  error?: unknown,
): string | null {
  if (isSignInTransferable(signIn)) {
    return SIGN_IN_NEEDS_SIGN_UP_MESSAGE;
  }

  const signUpStatus = readStatus(signUp);
  const createdSessionId = (signUp as { createdSessionId?: unknown } | null)?.createdSessionId;
  if (signUpStatus === 'missing_requirements' && !createdSessionId) {
    return SIGN_IN_NEEDS_SIGN_UP_MESSAGE;
  }

  if (errorLooksLikeRestrictedSignUp(error)) {
    return SIGN_IN_NEEDS_SIGN_UP_MESSAGE;
  }

  return null;
}

export function errorLooksLikeRestrictedSignUp(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return typeof error === 'string' && /sign[- ]?up.*(restrict|not allowed|disabled)/i.test(error);
  }

  const record = error as {
    code?: unknown;
    message?: unknown;
    longMessage?: unknown;
    errors?: { code?: string; message?: string; longMessage?: string }[];
  };
  const codes = [record.code, ...(record.errors ?? []).map((item) => item.code)]
    .filter((code): code is string => typeof code === 'string')
    .map((code) => code.toLowerCase());
  const restrictedCodes = [
    'sign_up_restricted',
    'not_allowed_to_sign_up',
    'registrations_not_allowed',
    'identifier_already_exists',
    'external_account_not_found',
  ];
  if (codes.some((code) => restrictedCodes.some((needle) => code.includes(needle)))) {
    return true;
  }

  const text = [record.message, record.longMessage, ...(record.errors ?? []).map((item) => item.longMessage ?? item.message)]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  return (
    text.includes('sign up') &&
    (text.includes('restrict') || text.includes('not allowed') || text.includes('disabled') || text.includes('transfer'))
  );
}

export function describeSsoCallbackState(params: {
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  signIn: unknown;
  signUp: unknown;
  error: string | null;
  timedOut: boolean;
}): string {
  const signInStatus = readStatus(params.signIn) ?? 'unknown';
  const signUpStatus = readStatus(params.signUp) ?? 'unknown';
  const verification = readVerificationStatus(params.signIn) ?? 'none';
  const parts = [
    `clerkLoaded=${params.isLoaded}`,
    `signedIn=${String(params.isSignedIn)}`,
    `signIn.status=${signInStatus}`,
    `signIn.verification=${verification}`,
    `signUp.status=${signUpStatus}`,
    params.timedOut ? 'timedOut=true' : null,
    params.error ? `error=${params.error}` : null,
  ].filter(Boolean);
  return parts.join('\n');
}
