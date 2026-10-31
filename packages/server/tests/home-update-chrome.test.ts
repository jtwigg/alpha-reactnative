import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { JS_OTA_BUILD, jsVersionLabel } from '../../reactnative/lib/app-version';
import { collectTexts, findNode, renderHomeChrome } from '../../reactnative/lib/home-update-chrome';

const rnRoot = join(dirname(fileURLToPath(import.meta.url)), '../../reactnative');

describe('Home version label + update banner', () => {
  it('renders the version label on Home even with no update', () => {
    const tree = renderHomeChrome({ prompt: null });
    const texts = collectTexts(tree);
    expect(findNode(tree, 'VersionLabel')?.text).toBe(jsVersionLabel());
    expect(texts).toContain(`v1.1.0 (ota ${JS_OTA_BUILD})`);
    expect(findNode(tree, 'UpdateBanner')).toBeNull();
    const types = (tree.children ?? []).map((child) => child.type);
    expect(types.indexOf('VersionLabel')).toBeLessThan(types.indexOf('Composer'));
    expect(types.indexOf('VersionLabel')).toBeGreaterThan(types.indexOf('Header'));
  });

  it('renders the banner at the top when a pending OTA is mocked', () => {
    const tree = renderHomeChrome({
      prompt: { kind: 'ota', pending: true },
      availableOta: JS_OTA_BUILD,
      dismissed: false,
    });
    const banner = findNode(tree, 'UpdateBanner');
    expect(banner?.text).toBe(`Update available: ota ${JS_OTA_BUILD}, tap to update & restart`);
    expect(findNode(tree, 'VersionLabel')?.text).toBe(`v1.1.0 (ota ${JS_OTA_BUILD})`);
    expect((tree.children ?? [])[0]?.type).toBe('UpdateBanner');
    expect(collectTexts(tree)).toEqual(
      expect.arrayContaining([
        `v1.1.0 (ota ${JS_OTA_BUILD})`,
        `Update available: ota ${JS_OTA_BUILD}, tap to update & restart`,
      ]),
    );
  });

  it('hides a dismissed banner for the session and still shows the label', () => {
    const tree = renderHomeChrome({
      prompt: { kind: 'native', latestBuildNumber: '4' },
      dismissed: true,
    });
    expect(findNode(tree, 'UpdateBanner')).toBeNull();
    expect(findNode(tree, 'VersionLabel')?.text).toBe(`v1.1.0 (ota ${JS_OTA_BUILD})`);
  });

  it('mounts banner then label on the Home screen, not under the composer', () => {
    const source = readFileSync(join(rnRoot, 'app/(tabs)/index.tsx'), 'utf8');
    expect(source).toContain('HomeUpdateBannerHost');
    expect(source).toContain('VersionLabel');
    expect(source.indexOf('HomeUpdateBannerHost')).toBeLessThan(source.indexOf('<VersionLabel'));
    expect(source.indexOf('<VersionLabel')).toBeLessThan(source.indexOf('HomeBody'));
    expect(source.indexOf('AppBuildLabel')).toBe(-1);
  });
});
