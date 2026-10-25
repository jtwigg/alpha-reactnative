import { convexQuery, routeParams } from './mock-convex';

process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_crash_guard';
process.env.EXPO_PUBLIC_CONVEX_URL = 'https://placeholder.convex.cloud';

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openBrowserAsync: jest.fn(),
}));

jest.mock('expo-av', () => ({
  Audio: {
    requestPermissionsAsync: async () => ({ granted: false, status: 'denied' }),
    setAudioModeAsync: async () => undefined,
    Recording: class {
      static createAsync = async () => ({ recording: { stopAndUnloadAsync: async () => undefined, getURI: () => null } });
    },
  },
}));

jest.mock('expo-haptics', () => ({
  impactAsync: async () => undefined,
  notificationAsync: async () => undefined,
  selectionAsync: async () => undefined,
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

jest.mock('expo-linking', () => ({
  createURL: (path: string) => `johnsapp://${path}`,
  openURL: jest.fn(),
}));

jest.mock('expo-updates', () => ({
  isEnabled: false,
  useUpdates: () => ({
    isUpdateAvailable: false,
    isUpdatePending: false,
    isDownloading: false,
    availableUpdate: null,
    downloadedUpdate: null,
  }),
  checkForUpdateAsync: async () => ({ isAvailable: false }),
  fetchUpdateAsync: async () => ({ isNew: false }),
  reloadAsync: async () => undefined,
}));

jest.mock('expo-constants', () => ({
  expoConfig: { extra: { jsOtaBuild: 18 }, version: '1.0.0' },
  executionEnvironment: 'bare',
}));

jest.mock('@sentry/react-native', () => {
  const wrap = (component: unknown) => component;
  return {
    init: jest.fn(),
    wrap,
    getClient: () => null,
    captureException: jest.fn(),
    addBreadcrumb: jest.fn(),
    setUser: jest.fn(),
    logger: { info: jest.fn() },
  };
});

jest.mock('@clerk/expo/token-cache', () => ({ tokenCache: undefined }));

jest.mock('@clerk/expo', () => {
  const React = require('react');
  return {
    ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
    useAuth: () => ({
      isLoaded: true,
      isSignedIn: true,
      userId: 'user_1',
      getToken: async () => null,
      sessionClaims: { aud: 'convex' },
      sessionId: 'sess_1',
      orgId: null,
      orgRole: null,
      signOut: async () => undefined,
    }),
    useUser: () => ({
      user: {
        id: 'user_1',
        fullName: 'Test User',
        primaryEmailAddress: { emailAddress: 't@example.com' },
      },
    }),
    useClerk: () => ({ signOut: async () => undefined }),
  };
});

jest.mock('convex/react', () => {
  const React = require('react');
  const { resolveQuery, resolvePaginated } = require('./mock-convex');
  return {
    useQuery: (_query: unknown, args?: unknown) => resolveQuery(args),
    usePaginatedQuery: () => resolvePaginated(),
    useMutation: () => jest.fn(async () => 'user_1'),
    useAction: () => jest.fn(async () => ({ ok: true })),
    useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
    ConvexProviderWithAuth: ({ children }: { children: React.ReactNode }) => children,
    ConvexReactClient: class ConvexReactClient {
      constructor(_url?: string) {}
    },
  };
});

jest.mock('expo-router', () => {
  const React = require('react');
  const Stack = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  Stack.Screen = () => null;
  const Tabs = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  Tabs.Screen = () => null;
  return {
    Stack,
    Tabs,
    Redirect: () => null,
    Link: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    useRouter: () => ({
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
      navigate: jest.fn(),
    }),
    useLocalSearchParams: () => require('./mock-convex').routeParams.current,
    useGlobalSearchParams: () => require('./mock-convex').routeParams.current,
    usePathname: () => '/',
    useSegments: () => [],
  };
});

const originalError = console.error;
beforeEach(() => {
  convexQuery.mode = 'throw';
  routeParams.current = { accountId: 'acc_brokerage' };
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    const text = args.map(String).join(' ');
    if (
      text.includes('Backend unavailable') ||
      text.includes('ErrorBoundary') ||
      text.includes('React will try to recreate') ||
      text.includes('not wrapped in act')
    ) {
      return;
    }
    originalError(...(args as []));
  });
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore?.();
});
