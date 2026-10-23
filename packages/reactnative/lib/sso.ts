import * as AuthSession from 'expo-auth-session';

export const APP_SCHEME = 'johnsapp';
export const SSO_CALLBACK_PATH = 'sso-callback';

/** Native: johnsapp://sso-callback. Web: current origin + /sso-callback. */
export function getSsoRedirectUrl() {
  return AuthSession.makeRedirectUri({
    scheme: APP_SCHEME,
    path: SSO_CALLBACK_PATH,
  });
}
