#!/usr/bin/env node
/**
 * Writes Apple AASA + Android Digital Asset Links into public/ (and optionally dist/).
 * Bundle id and Android package come from app.config.js.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = dirname(fileURLToPath(import.meta.url));
const appRoot = join(root, '..');
const spec = require(join(appRoot, 'lib/app-links.json'));
const define = require(join(appRoot, 'app.config.js'));
const config = typeof define === 'function' ? define({ config: {} }) : define;

const bundleId = config.ios?.bundleIdentifier;
const androidPackage = config.android?.package;
if (!bundleId || !androidPackage) {
  console.error('app.config.js is missing ios.bundleIdentifier or android.package');
  process.exit(1);
}

const appId = `${spec.appleTeamId}.${bundleId}`;
const paths = ['/', '/home', '/briefings', '/briefings/*', '/finances', '/finances/*', '/plaid-oauth'];
const fingerprints = Array.isArray(spec.androidSha256CertFingerprints) ? spec.androidSha256CertFingerprints : [];

const aasa = {
  applinks: {
    apps: [],
    details: [
      {
        appID: appId,
        paths,
        appIDs: [appId],
        components: paths.map((path) => ({ '/': path })),
      },
    ],
  },
};

const assetLinks = [
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: androidPackage,
      sha256_cert_fingerprints: fingerprints,
    },
    ...(fingerprints.length === 0
      ? {
          _todo: 'Add the SHA256 cert fingerprint from EAS Android credentials (eas credentials). Not present in eas.json or the repo.',
        }
      : {}),
  },
];

function writeDir(dir) {
  const aasaBody = `${JSON.stringify(aasa)}\n`;
  const assetBody = `${JSON.stringify(assetLinks, null, 2)}\n`;

  const hidden = join(dir, '.well-known');
  mkdirSync(hidden, { recursive: true });
  writeFileSync(join(hidden, 'apple-app-site-association'), aasaBody);
  writeFileSync(join(hidden, 'assetlinks.json'), assetBody);

  // Non-dot .json copies: Vercel static output often skips hidden dirs and
  // extensionless files. vercel.json rewrites the spec URLs onto these.
  const visible = join(dir, 'well-known');
  mkdirSync(visible, { recursive: true });
  writeFileSync(join(visible, 'apple-app-site-association.json'), aasaBody);
  writeFileSync(join(visible, 'assetlinks.json'), assetBody);
}

const dests = [join(appRoot, 'public')];
const outFlag = process.argv.indexOf('--out');
if (outFlag >= 0 && process.argv[outFlag + 1]) {
  dests.push(join(appRoot, process.argv[outFlag + 1]));
}

for (const dest of dests) writeDir(dest);
console.log(`wrote AASA + assetlinks for ${appId} / ${androidPackage} → ${dests.join(', ')}`);
if (fingerprints.length === 0) {
  console.log('TODO: androidSha256CertFingerprints is empty — Android App Links will not verify until a SHA256 is added.');
}
