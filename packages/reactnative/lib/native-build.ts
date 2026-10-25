import Constants from 'expo-constants';

/**
 * CFBundleVersion / versionCode from the installed binary.
 * Prefer expo-application (already in the TestFlight SDK); fall back to
 * expo-constants so an OTA still works if Application is not linked.
 */
export function currentNativeBuildVersion(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Application = require('expo-application') as { nativeBuildVersion?: string | null };
    const fromApp = Application.nativeBuildVersion;
    if (fromApp != null && String(fromApp).trim()) return String(fromApp);
  } catch {
    // module missing or web
  }
  try {
    const fromConstants = Constants.nativeBuildVersion;
    if (fromConstants != null && String(fromConstants).trim()) return String(fromConstants);
  } catch {
    // Constants unavailable
  }
  return null;
}

export function jsOtaBuildFromConfig(): number | null {
  try {
    return typeof Constants.expoConfig?.extra?.jsOtaBuild === 'number'
      ? Constants.expoConfig.extra.jsOtaBuild
      : null;
  } catch {
    return null;
  }
}
