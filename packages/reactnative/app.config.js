const bundleIdentifier = process.env.IOS_BUNDLE_IDENTIFIER ?? 'com.example.johnsapp';
const androidPackage = process.env.ANDROID_PACKAGE ?? 'com.example.johnsapp';
// Filled by `eas init` / `eas update:configure`, or set EAS_PROJECT_ID.
const projectId = process.env.EAS_PROJECT_ID;

module.exports = ({ config }) => ({
  ...config,
  name: "John's App",
  slug: 'johns-app',
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
    infoPlist: {
      NSMicrophoneUsageDescription:
        'Allow microphone access so you can dictate chat messages.',
    },
  },
  android: {
    package: androidPackage,
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    permissions: ['RECORD_AUDIO'],
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
        backgroundColor: '#ffffff',
        dark: {
          backgroundColor: '#000000',
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
      origin: false,
    },
    eas: {
      projectId,
    },
  },
  ...(process.env.EXPO_OWNER ? { owner: process.env.EXPO_OWNER } : {}),
});
