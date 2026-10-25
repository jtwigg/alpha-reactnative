import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  APP_VERSION,
  JS_OTA_BUILD,
  formatBuildDetail,
  formatPacific,
  jsVersionLabel,
  shortUpdateId,
} from '../../reactnative/lib/app-version';

const require = createRequire(import.meta.url);
const rnRoot = join(dirname(fileURLToPath(import.meta.url)), '../../reactnative');

describe('app version stamp', () => {
  it('keeps the binary version at 1.0.0 and bumps the JS OTA counter', () => {
    expect(APP_VERSION).toBe('1.0.0');
    expect(JS_OTA_BUILD).toBe(18);
    expect(jsVersionLabel()).toBe('v1.0.0 (ota 18)');
  });

  it('shortens an expo-updates UUID and formats createdAt in Pacific time', () => {
    expect(shortUpdateId('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe('a1b2c3d4');
    expect(shortUpdateId(null)).toBeNull();
    // 2026-10-24T23:12:00Z is 4:12 PM PDT
    expect(formatPacific(new Date('2026-10-24T23:12:00.000Z'))).toBe('Oct 24, 2026, 4:12 PM PDT');
    expect(
      formatBuildDetail({
        updateId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        createdAt: new Date('2026-10-24T23:12:00.000Z'),
        embedded: false,
      }),
    ).toBe('1.0.0 · a1b2c3d4 · Oct 24, 2026, 4:12 PM PDT');
  });

  it('embeds jsOtaBuild in extra without changing runtimeVersion', () => {
    const define = require(join(rnRoot, 'app.config.js')) as (args: { config: object }) => {
      version: string;
      runtimeVersion: { policy: string };
      extra: { jsOtaBuild: number };
    };
    const config = define({ config: {} });
    expect(config.version).toBe('1.0.0');
    expect(config.runtimeVersion).toEqual({ policy: 'appVersion' });
    expect(config.extra.jsOtaBuild).toBe(18);
  });

  it('says embedded when there is no downloaded update', () => {
    expect(formatBuildDetail({ updateId: null, createdAt: null, embedded: true })).toBe(
      '1.0.0 · embedded',
    );
    expect(
      formatBuildDetail({
        updateId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        createdAt: new Date('2026-10-24T23:12:00.000Z'),
        embedded: true,
      }),
    ).toBe('1.0.0 · embedded');
  });
});
