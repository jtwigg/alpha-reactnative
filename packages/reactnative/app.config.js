const fs = require('fs');
const path = require('path');

const appLinks = require('./lib/app-links.json');
const bundleIdentifier = process.env.IOS_BUNDLE_IDENTIFIER ?? 'com.twigg.alpha';
const androidPackage = process.env.ANDROID_PACKAGE ?? 'com.example.johnsapp';
const appLinkHost = appLinks.host ?? 'alpha-theta-silk.vercel.app';
// Filled by `eas init` / `eas update:configure`, or set EAS_PROJECT_ID.
const projectId = process.env.EAS_PROJECT_ID ?? '45f0cfd7-2b50-4deb-b537-b5e44f76b937';

const appVersionSrc = fs.readFileSync(path.join(__dirname, 'lib/app-version.ts'), 'utf8');
const jsOtaBuild = Number(/export const JS_OTA_BUILD = (\d+)/.exec(appVersionSrc)?.[1] ?? 0);

module.exports = ({ config }) => ({
  ...config,
  name: 'Alpha',
  slug: 'alpha-mono',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'johnsapp',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  // appVersion: runtimeVersion === expo.version. JS-only OTA stays on the same
  // binary; bump version (and cut a new iOS build) when native code changes.
  // Prefer this over fingerprint so GitHub Actions (Linux) and EAS iOS builders
  // cannot disagree on the hash.
  runtimeVersion: {
    policy: 'appVersion',
  },
  updates: {
    url: projectId
      ? `https://u.expo.dev/${projectId}`
      : 'https://u.expo.dev/00000000-0000-0000-0000-000000000000',
    enabled: true,
    checkAutomatically: 'ON_LOAD',
    fallbackToCacheTimeout: 0,
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier,
    associatedDomains: [`applinks:${appLinkHost}`],
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSMicrophoneUsageDescription:
        'Allow microphone access so you can dictate chat messages.',
    },
  },
  android: {
    package: androidPackage,
    adaptiveIcon: {
      backgroundColor: '#1b1f4a',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    permissions: ['RECORD_AUDIO'],
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          {
            scheme: 'https',
            host: appLinkHost,
          },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
    bundler: 'metro',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    '@clerk/expo',
    'expo-updates',
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#1b1f4a',
        dark: {
          backgroundColor: '#1b1f4a',
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    router: {
      origin: `https://${appLinkHost}`,
    },
    eas: {
      projectId,
    },
    jsOtaBuild,
  },
  owner: process.env.EXPO_OWNER ?? 'asdf989',
});
