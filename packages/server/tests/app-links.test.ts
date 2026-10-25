import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { briefingItemId } from '../convex/briefings/payload';
import {
  ANDROID_SHA256_CERT_FINGERPRINTS,
  APP_LINK_HOST,
  APP_LINK_PATHS,
  APPLE_TEAM_ID,
  accountPath,
  appleAppId,
  appleAppSiteAssociation,
  assetLinksJson,
  briefingsPath,
  currentAppPath,
  findBriefingItem,
  homePath,
  parseAccountId,
  parseAskId,
  parseBriefingDate,
  parseBriefingItemRef,
  parseRange,
  safeReturnPath,
  signInPath,
} from '../../reactnative/lib/app-links';
import { nativeConfigFields } from '../../reactnative/scripts/check-native.mjs';

const require = createRequire(import.meta.url);
const rnRoot = join(dirname(fileURLToPath(import.meta.url)), '../../reactnative');
const spec = JSON.parse(readFileSync(join(rnRoot, 'lib/app-links.json'), 'utf8'));
const define = require(join(rnRoot, 'app.config.js'));
const config = typeof define === 'function' ? define({ config: {} }) : define;
const vercel = JSON.parse(readFileSync(join(rnRoot, '../../vercel.json'), 'utf8'));
const aasa = JSON.parse(readFileSync(join(rnRoot, 'public/.well-known/apple-app-site-association'), 'utf8'));
const assetlinks = JSON.parse(readFileSync(join(rnRoot, 'public/.well-known/assetlinks.json'), 'utf8'));

describe('app link parsers', () => {
  it('accepts calendar dates and rejects impossible days', () => {
    expect(parseBriefingDate('2026-01-15')).toBe('2026-01-15');
    expect(parseBriefingDate('2026-02-30')).toBeNull();
    expect(parseBriefingDate('15-01-2026')).toBeNull();
    expect(parseBriefingDate('not-a-date')).toBeNull();
  });

  it('parses item ids as date + account + thread id only', () => {
    const itemId = briefingItemId('2026-01-15', 'personal', 'aabbccddee');
    expect(parseBriefingItemRef(itemId)).toEqual({
      date: '2026-01-15',
      account: 'personal',
      threadId: 'aabbccddee',
      itemId,
    });
    expect(parseBriefingItemRef('personal-ff001122', '2026-03-01')?.threadId).toBe('ff001122');
    expect(parseBriefingItemRef('leak the subject line')).toBeNull();
  });

  it('parses ask, account, and range ids without treating them as content', () => {
    expect(parseAskId('ask_k1')).toBe('ask_k1');
    expect(parseAskId('what is my net worth?')).toBeNull();
    expect(parseAccountId('acc_brokerage')).toBe('acc_brokerage');
    expect(parseAccountId('not a valid id')).toBeNull();
    expect(parseRange('3M')).toBe('3M');
    expect(parseRange('forever')).toBeNull();
  });

  it('builds URL patterns that carry only ids and dates', () => {
    expect(homePath('ask_k1')).toBe('/home?ask=ask_k1');
    expect(briefingsPath()).toBe('/briefings');
    expect(briefingsPath('2026-01-15')).toBe('/briefings/2026-01-15');
    expect(briefingsPath('2026-01-15', briefingItemId('2026-01-15', 'crankcase', 'abc123'))).toBe(
      '/briefings/2026-01-15/items/2026-01-15-crankcase-abc123',
    );
    expect(accountPath('acc_1', { range: '3M' })).toBe('/finances/acc_1?range=3M');
    expect(accountPath('acc_1', { demo: true })).toBe('/finances/acc_1?demo=1');
  });

  it('only returns to in-app paths after sign-in', () => {
    expect(safeReturnPath('/briefings/2026-01-15')).toBe('/briefings/2026-01-15');
    expect(safeReturnPath('/home?ask=ask_k1')).toBe('/home?ask=ask_k1');
    expect(safeReturnPath('https://evil.example/home')).toBeNull();
    expect(safeReturnPath('//evil.example')).toBeNull();
    expect(signInPath('/finances/acc_1?range=1Y')).toBe('/sign-in?return=%2Ffinances%2Facc_1%3Frange%3D1Y');
    expect(currentAppPath('/home', { ask: 'ask_k1' })).toBe('/home?ask=ask_k1');
  });

  it('finds an item by thread id across accounts', () => {
    const day = {
      personal: { priorities: [{ threadId: 'aa11bb' }], glance: [] },
      crankcase: { priorities: [], glance: [{ threadId: 'cc22dd' }] },
    };
    expect(findBriefingItem(day, parseBriefingItemRef('aa11bb', '2026-01-15')!)?.account).toBe('personal');
    expect(findBriefingItem(day, parseBriefingItemRef('cc22dd', '2026-01-15')!)?.account).toBe('crankcase');
    expect(findBriefingItem(day, parseBriefingItemRef('deadbeef', '2026-01-15')!)).toBeNull();
  });
});

describe('well-known association files', () => {
  it('keeps host, team, and empty Android fingerprints in sync', () => {
    expect(spec.host).toBe(APP_LINK_HOST);
    expect(spec.appleTeamId).toBe(APPLE_TEAM_ID);
    expect(spec.androidSha256CertFingerprints).toEqual(ANDROID_SHA256_CERT_FINGERPRINTS);
    expect(ANDROID_SHA256_CERT_FINGERPRINTS).toEqual([]);
    expect(APP_LINK_HOST).toBe('alpha-theta-silk.vercel.app');
    expect(APPLE_TEAM_ID).toBe('V488294NXN');
  });

  it('serves AASA for the app config bundle id and listed paths', () => {
    const bundleId = config.ios.bundleIdentifier;
    expect(bundleId).toBe('com.twigg.alpha');
    expect(aasa).toEqual(appleAppSiteAssociation(bundleId));
    expect(aasa.applinks.details[0].appID).toBe(appleAppId(bundleId));
    expect(aasa.applinks.details[0].paths).toEqual([...APP_LINK_PATHS]);
  });

  it('marks assetlinks with a TODO when no SHA256 fingerprint is configured', () => {
    const pkg = config.android.package;
    expect(pkg).toBe('com.example.johnsapp');
    expect(assetlinks).toEqual(assetLinksJson(pkg));
    expect(assetlinks[0].target.sha256_cert_fingerprints).toEqual([]);
    expect(assetlinks[0]._todo).toMatch(/SHA256/);
  });

  it('does not rewrite /.well-known and sets JSON content-type', () => {
    const rewrite = vercel.rewrites[0].source as string;
    expect(rewrite).toContain('well-known');
    const aasaHeader = vercel.headers.find((row: { source: string }) =>
      row.source.includes('apple-app-site-association'),
    );
    expect(aasaHeader.headers).toEqual([{ key: 'Content-Type', value: 'application/json' }]);
  });
});

describe('native app link config', () => {
  it('registers associatedDomains and autoVerify intent filters', () => {
    expect(config.ios.associatedDomains).toEqual([`applinks:${APP_LINK_HOST}`]);
    expect(config.android.intentFilters[0].autoVerify).toBe(true);
    expect(config.android.intentFilters[0].data[0]).toEqual({ scheme: 'https', host: APP_LINK_HOST });
    expect(config.runtimeVersion).toEqual({ policy: 'appVersion' });
    expect(config.version).toBe('1.0.0');
    const fields = nativeConfigFields(config);
    expect(fields.ios.associatedDomains).toEqual([`applinks:${APP_LINK_HOST}`]);
    expect(fields.android.intentFilters[0].autoVerify).toBe(true);
  });
});
