#!/usr/bin/env node
/**
 * Diff native-affecting inputs against the last TestFlight baseline.
 * Exit 0: unchanged (OTA is enough)
 * Exit 2: changed (cut a new TestFlight; OTA workflow should skip)
 * Exit 1: script error
 *
 *   node scripts/check-native.mjs
 *   node scripts/check-native.mjs --write
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = dirname(fileURLToPath(import.meta.url));
const appRoot = join(root, '..');
const fingerprintPath = join(appRoot, '.native-fingerprint.json');
const write = process.argv.includes('--write');

const NATIVE_DEP = /^(expo|react-native|@sentry\/react-native|@expo\/|react-native-)/;
const JS_ONLY_DEP = /^(jest-expo$|babel-preset-expo$|@testing-library\/)/;

export function nativeDepVersions(pkg) {
  const all = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  return Object.fromEntries(
    Object.entries(all)
      .filter(([name]) => NATIVE_DEP.test(name) && !JS_ONLY_DEP.test(name))
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

/** Fields that change the binary. Extra (jsOtaBuild) is JS-only and omitted. */
export function nativeConfigFields(config) {
  return {
    newArchEnabled: config.newArchEnabled,
    runtimeVersion: config.runtimeVersion,
    scheme: config.scheme,
    plugins: config.plugins,
    icon: config.icon,
    orientation: config.orientation,
    userInterfaceStyle: config.userInterfaceStyle,
    ios: {
      bundleIdentifier: config.ios?.bundleIdentifier,
      supportsTablet: config.ios?.supportsTablet,
      associatedDomains: config.ios?.associatedDomains,
      infoPlist: config.ios?.infoPlist,
    },
    android: {
      package: config.android?.package,
      permissions: config.android?.permissions,
      adaptiveIcon: config.android?.adaptiveIcon,
      edgeToEdgeEnabled: config.android?.edgeToEdgeEnabled,
      intentFilters: config.android?.intentFilters,
    },
  };
}

export function fallbackNativeFingerprint(appDir = appRoot) {
  const pkg = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8'));
  const define = require(join(appDir, 'app.config.js'));
  const config = typeof define === 'function' ? define({ config: {} }) : define;
  const payload = {
    deps: nativeDepVersions(pkg),
    config: nativeConfigFields(config),
  };
  const hash = createHash('sha1').update(JSON.stringify(payload)).digest('hex');
  return { method: 'fallback', hash, payload };
}

const SOURCE_SKIPS = {
  ExpoConfigVersions: 1,
  ExpoConfigNames: 4,
  ExpoConfigEASProject: 64,
  PackageJsonScriptsAll: 1024,
  ExpoConfigExtraSection: 4096,
};

export async function expoNativeFingerprint(appDir = appRoot) {
  try {
    const fingerprint = await import('@expo/fingerprint');
    const sourceSkips =
      (fingerprint.SourceSkips?.ExpoConfigVersions ?? SOURCE_SKIPS.ExpoConfigVersions) |
      (fingerprint.SourceSkips?.ExpoConfigNames ?? SOURCE_SKIPS.ExpoConfigNames) |
      (fingerprint.SourceSkips?.ExpoConfigEASProject ?? SOURCE_SKIPS.ExpoConfigEASProject) |
      (fingerprint.SourceSkips?.PackageJsonScriptsAll ?? SOURCE_SKIPS.PackageJsonScriptsAll) |
      (fingerprint.SourceSkips?.ExpoConfigExtraSection ?? SOURCE_SKIPS.ExpoConfigExtraSection);
    const fp = await fingerprint.createFingerprintAsync(appDir, { sourceSkips });
    return { method: 'expo-fingerprint', hash: fp.hash, sourceCount: fp.sources?.length ?? 0 };
  } catch (error) {
    return { method: 'expo-fingerprint', hash: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export function fingerprintsMatch(baseline, current) {
  if (!baseline || !current) return false;
  if (baseline.hash && current.hash && baseline.method === current.method) {
    return baseline.hash === current.hash;
  }
  if (baseline.fallbackHash && current.fallbackHash) {
    return baseline.fallbackHash === current.fallbackHash;
  }
  return Boolean(baseline.hash && current.hash && baseline.hash === current.hash);
}

export async function collectFingerprint(appDir = appRoot) {
  const fallback = fallbackNativeFingerprint(appDir);
  const expo = await expoNativeFingerprint(appDir);
  const method = expo.hash ? 'expo-fingerprint' : 'fallback';
  return {
    buildNumber: '3',
    runtimeVersion: '1.0.0',
    method,
    hash: expo.hash ?? fallback.hash,
    fallbackHash: fallback.hash,
    sourceCount: expo.sourceCount ?? null,
    createdAt: new Date().toISOString(),
  };
}

function printResult(current, baseline, match) {
  console.log(`method=${current.method}`);
  console.log(`hash=${current.hash}`);
  console.log(`fallbackHash=${current.fallbackHash}`);
  if (baseline) {
    console.log(`baseline.method=${baseline.method}`);
    console.log(`baseline.hash=${baseline.hash}`);
    console.log(`baseline.fallbackHash=${baseline.fallbackHash ?? ''}`);
    console.log(`baseline.buildNumber=${baseline.buildNumber ?? ''}`);
    console.log(match ? 'native fingerprint unchanged' : 'native fingerprint CHANGED — OTA is insufficient');
  } else {
    console.log('no baseline fingerprint (.native-fingerprint.json)');
  }
}

async function main() {
  const current = await collectFingerprint();
  if (write) {
    writeFileSync(fingerprintPath, `${JSON.stringify(current, null, 2)}\n`);
    console.log(`wrote ${fingerprintPath}`);
    printResult(current, current, true);
    process.exit(0);
  }
  if (!existsSync(fingerprintPath)) {
    printResult(current, null, false);
    process.exit(2);
  }
  const baseline = JSON.parse(readFileSync(fingerprintPath, 'utf8'));
  const match = fingerprintsMatch(baseline, current);
  printResult(current, baseline, match);
  process.exit(match ? 0 : 2);
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
