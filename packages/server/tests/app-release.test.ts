import { describe, expect, it } from 'vitest';
import * as release from '../convex/app/release';
import {
  APPLE_APP_ID,
  TESTFLIGHT_ITMS_URL,
  TESTFLIGHT_WEB_URL,
  APP_STORE_URL,
  applyOtaUpdate,
  isNativeBuildOlder,
  openTestFlight,
  otaBuildFromExtra,
  otaBuildFromManifest,
  parseBuildNumber,
  pickUpdatePrompt,
  testflightOpenUrls,
  updateBannerCopy,
} from '../../reactnative/lib/app-update';

type Handler = (ctx: unknown, args: unknown) => Promise<unknown>;
const run = (fn: unknown, ctx: unknown, args: unknown) => (fn as { _handler: Handler })._handler(ctx, args);

function fakeDb() {
  const tables: Record<string, Record<string, unknown>[]> = { app_release: [] };
  let n = 0;
  const db = {
    query(table: string) {
      let rows = [...(tables[table] ?? [])];
      return {
        withIndex(_name: string, range?: (q: unknown) => unknown) {
          const conds: Array<(row: Record<string, unknown>) => boolean> = [];
          const q = { eq: (f: string, v: unknown) => (conds.push((r) => r[f] === v), q) };
          range?.(q);
          rows = rows.filter((row) => conds.every((cond) => cond(row)));
          return this;
        },
        async unique() {
          return rows[0] ?? null;
        },
      };
    },
    async insert(table: string, doc: Record<string, unknown>) {
      const row = { ...doc, _id: `id_${n++}` };
      tables[table].push(row);
      return row._id;
    },
    async patch(id: string, doc: Record<string, unknown>) {
      const table = Object.keys(tables).find((name) => tables[name].some((row) => row._id === id));
      if (!table) throw new Error('missing');
      tables[table] = tables[table].map((row) => (row._id === id ? { ...row, ...doc } : row));
    },
  };
  return { ctx: { db }, tables };
}

describe('app/release', () => {
  it('inserts then patches the latest singleton', async () => {
    const { ctx, tables } = fakeDb();
    const first = (await run(release.setLatestBuild, ctx, {
      latestBuildNumber: 4,
      runtimeVersion: '1.0.0',
    })) as { latestBuildNumber: string; runtimeVersion: string };
    expect(first).toMatchObject({ latestBuildNumber: '4', runtimeVersion: '1.0.0', testflightUrl: null });
    expect(tables.app_release).toHaveLength(1);

    const latest = await run(release.latest, ctx, {});
    expect(latest).toMatchObject({ latestBuildNumber: '4', runtimeVersion: '1.0.0' });

    await run(release.setLatestBuild, ctx, {
      latestBuildNumber: '5',
      testflightUrl: 'https://testflight.apple.com/join/example',
    });
    expect(tables.app_release).toHaveLength(1);
    expect(tables.app_release[0]).toMatchObject({
      key: 'latest',
      latestBuildNumber: '5',
      runtimeVersion: '1.0.0',
      testflightUrl: 'https://testflight.apple.com/join/example',
    });
  });

  it('defaults runtimeVersion to 1.0.0 and rejects a blank build number', () => {
    expect(release.normalizeRuntimeVersion(undefined)).toBe('1.0.0');
    expect(release.normalizeRuntimeVersion('  ')).toBe('1.0.0');
    expect(() => release.normalizeBuildNumber('  ')).toThrow(/required/);
  });
});

describe('native vs OTA prompt', () => {
  it('treats a higher latestBuildNumber as an older installed binary', () => {
    expect(parseBuildNumber('03')).toBe(3);
    expect(isNativeBuildOlder('3', '4')).toBe(true);
    expect(isNativeBuildOlder(3, 3)).toBe(false);
    expect(isNativeBuildOlder(null, '4')).toBe(false);
  });

  it('prefers the native-build prompt over an available OTA', () => {
    expect(
      pickUpdatePrompt({ currentBuild: '3', latestBuild: '4', otaAvailable: true, otaPending: true }),
    ).toEqual({ kind: 'native', latestBuildNumber: '4' });
    expect(
      pickUpdatePrompt({ currentBuild: '4', latestBuild: '4', otaAvailable: true, otaPending: false }),
    ).toEqual({ kind: 'ota', pending: false });
    expect(
      pickUpdatePrompt({ currentBuild: '4', latestBuild: '4', otaAvailable: true, otaPending: true }),
    ).toEqual({ kind: 'ota', pending: true });
    expect(
      pickUpdatePrompt({ currentBuild: '3', latestBuild: null, otaAvailable: false, otaPending: false }),
    ).toBeNull();
  });

  it('uses the Home banner copy and prefers native over OTA', () => {
    expect(updateBannerCopy({ kind: 'native', latestBuildNumber: '4' })).toBe(
      'New build available, open TestFlight',
    );
    expect(updateBannerCopy({ kind: 'ota', pending: false }, { availableOta: 16 })).toBe(
      'Update available: ota 16, tap to update & restart',
    );
    expect(updateBannerCopy({ kind: 'ota', pending: true }, { availableOta: 16, busy: true })).toBe(
      'Downloading update…',
    );
    expect(otaBuildFromManifest({ extra: { expoClient: { extra: { jsOtaBuild: 16 } } } })).toBe(16);
  });

  it('opens TestFlight itms-beta first, then web fallbacks, without canOpenURL', async () => {
    expect(APPLE_APP_ID).toBe('6826694231');
    expect(testflightOpenUrls()).toEqual([TESTFLIGHT_ITMS_URL, TESTFLIGHT_WEB_URL, APP_STORE_URL]);
    expect(TESTFLIGHT_ITMS_URL).toBe('itms-beta://beta.itunes.apple.com/v1/app/6826694231');

    const attempts: string[] = [];
    const result = await openTestFlight(async (url) => {
      attempts.push(url);
      if (url.startsWith('itms-beta:')) throw new Error('no TestFlight app');
    });
    expect(result).toBe('opened');
    expect(attempts).toEqual([TESTFLIGHT_ITMS_URL, TESTFLIGHT_WEB_URL]);
  });

  it('reads jsOtaBuild from the published extra and no-ops OTA when disabled', async () => {
    expect(otaBuildFromExtra({ jsOtaBuild: 13 })).toBe(13);
    expect(otaBuildFromExtra({})).toBeNull();
    expect(
      await applyOtaUpdate({
        isEnabled: false,
        checkForUpdateAsync: async () => ({ isAvailable: true }),
        fetchUpdateAsync: async () => ({ isNew: true }),
        reloadAsync: async () => undefined,
      }),
    ).toBe('idle');
    expect(
      await applyOtaUpdate({
        isEnabled: true,
        checkForUpdateAsync: async () => ({ isAvailable: true }),
        fetchUpdateAsync: async () => ({ isNew: true }),
        reloadAsync: async () => undefined,
      }),
    ).toBe('reloaded');
  });
});
