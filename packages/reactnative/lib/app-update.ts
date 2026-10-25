export const APPLE_APP_ID = '6826694231';
export const TESTFLIGHT_ITMS_URL = `itms-beta://beta.itunes.apple.com/v1/app/${APPLE_APP_ID}`;
export const TESTFLIGHT_WEB_URL = 'https://testflight.apple.com';
export const APP_STORE_URL = `https://apps.apple.com/app/id${APPLE_APP_ID}`;

export type NativeRelease = {
  latestBuildNumber: string;
  runtimeVersion?: string | null;
  testflightUrl?: string | null;
};

export type UpdatePrompt =
  | { kind: 'native'; latestBuildNumber: string }
  | { kind: 'ota'; pending: boolean }
  | null;

/** Parse CFBundleVersion / versionCode. `3` and `"03"` compare as 3. */
export function parseBuildNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export function isNativeBuildOlder(
  currentBuild: string | number | null | undefined,
  latestBuild: string | number | null | undefined,
): boolean {
  const current = parseBuildNumber(currentBuild);
  const latest = parseBuildNumber(latestBuild);
  if (current == null || latest == null) return false;
  return current < latest;
}

export function pickUpdatePrompt(args: {
  currentBuild: string | number | null | undefined;
  latestBuild: string | number | null | undefined;
  otaAvailable: boolean;
  otaPending: boolean;
}): UpdatePrompt {
  if (isNativeBuildOlder(args.currentBuild, args.latestBuild)) {
    return { kind: 'native', latestBuildNumber: String(args.latestBuild).trim() };
  }
  if (args.otaPending) return { kind: 'ota', pending: true };
  if (args.otaAvailable) return { kind: 'ota', pending: false };
  return null;
}

export function otaBuildFromManifest(manifest: unknown): number | null {
  if (!manifest || typeof manifest !== 'object') return null;
  const extra = (manifest as { extra?: unknown }).extra;
  const direct = otaBuildFromExtra(extra);
  if (direct != null) return direct;
  if (extra && typeof extra === 'object') {
    const expoClient = (extra as { expoClient?: { extra?: unknown } }).expoClient;
    return otaBuildFromExtra(expoClient?.extra);
  }
  return null;
}

export function updateBannerCopy(
  prompt: UpdatePrompt,
  opts: { availableOta?: number | null; busy?: boolean } = {},
): string | null {
  if (!prompt) return null;
  if (prompt.kind === 'native') return 'New build available, open TestFlight';
  if (opts.busy) return 'Downloading update…';
  const n = opts.availableOta;
  if (n != null && Number.isFinite(n)) return `Update available: ota ${n}, tap to update & restart`;
  return 'Update available, tap to update & restart';
}

/** @deprecated Use updateBannerCopy. Kept for older tests. */
export function updatePromptLabel(
  prompt: UpdatePrompt,
  busy = false,
  availableOta?: number | null,
): string | null {
  return updateBannerCopy(prompt, { busy, availableOta });
}

export function testflightOpenUrls(storedUrl?: string | null): string[] {
  const extra = storedUrl?.trim();
  const urls = [TESTFLIGHT_ITMS_URL];
  if (extra && extra !== TESTFLIGHT_ITMS_URL && extra !== TESTFLIGHT_WEB_URL && extra !== APP_STORE_URL) {
    urls.push(extra);
  }
  urls.push(TESTFLIGHT_WEB_URL, APP_STORE_URL);
  return urls;
}

export async function openTestFlight(
  openUrl: (url: string) => Promise<void>,
  storedUrl?: string | null,
): Promise<'opened' | 'failed'> {
  for (const url of testflightOpenUrls(storedUrl)) {
    try {
      await openUrl(url);
      return 'opened';
    } catch {
      // try/catch only — no canOpenURL (would need LSApplicationQueriesSchemes).
    }
  }
  return 'failed';
}

export function otaBuildFromExtra(extra: unknown): number | null {
  if (!extra || typeof extra !== 'object') return null;
  const value = (extra as { jsOtaBuild?: unknown }).jsOtaBuild;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export type UpdatesClient = {
  isEnabled: boolean;
  checkForUpdateAsync: () => Promise<{ isAvailable?: boolean } | void>;
  fetchUpdateAsync: () => Promise<{ isNew?: boolean } | void>;
  reloadAsync: () => Promise<void>;
};

export async function applyOtaUpdate(
  client: UpdatesClient,
  alreadyPending = false,
): Promise<'reloaded' | 'idle' | 'failed'> {
  if (!client.isEnabled) return 'idle';
  try {
    if (!alreadyPending) {
      const fetched = await client.fetchUpdateAsync();
      if (!fetched?.isNew) {
        const check = await client.checkForUpdateAsync();
        if (!check?.isAvailable) return 'idle';
        await client.fetchUpdateAsync();
      }
    }
    await client.reloadAsync();
    return 'reloaded';
  } catch {
    return 'failed';
  }
}
