/**
 * Bump Expo app version and keep iOS buildNumber + Android versionCode in sync.
 *
 * Usage (from mobile/):
 *   node scripts/bump-app-version.mjs
 *   node scripts/bump-app-version.mjs --version 1.1.0
 *   node scripts/bump-app-version.mjs --set-build 12
 *   node scripts/bump-app-version.mjs --dry-run
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appJsonPath = join(__dirname, '..', 'app.json');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const versionFlagIndex = args.indexOf('--version');
const setBuildFlagIndex = args.indexOf('--set-build');

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function parseSemver(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

const raw = readFileSync(appJsonPath, 'utf8');
const config = JSON.parse(raw);
const expo = config?.expo;

if (!expo?.ios || !expo?.android) {
  fail('app.json is missing expo.ios or expo.android sections.');
}

const iosBuildRaw = expo.ios.buildNumber;
const androidVersionCode = expo.android.versionCode;

if (iosBuildRaw == null || androidVersionCode == null) {
  fail('app.json must define expo.ios.buildNumber and expo.android.versionCode.');
}

const iosBuild = Number.parseInt(String(iosBuildRaw), 10);
if (!Number.isFinite(iosBuild) || iosBuild < 1) {
  fail(`Invalid expo.ios.buildNumber: ${iosBuildRaw}`);
}
if (!Number.isInteger(androidVersionCode) || androidVersionCode < 1) {
  fail(`Invalid expo.android.versionCode: ${androidVersionCode}`);
}
if (iosBuild !== androidVersionCode) {
  fail(
    `iOS buildNumber (${iosBuild}) and Android versionCode (${androidVersionCode}) are out of sync. ` +
      'Fix app.json manually, then re-run this script.',
  );
}

let nextBuild = iosBuild + 1;
if (setBuildFlagIndex !== -1) {
  const value = args[setBuildFlagIndex + 1];
  if (!value) fail('--set-build requires a numeric value.');
  nextBuild = Number.parseInt(value, 10);
  if (!Number.isInteger(nextBuild) || nextBuild < 1) {
    fail(`--set-build must be a positive integer. Received: ${value}`);
  }
  if (nextBuild <= iosBuild) {
    fail(`--set-build (${nextBuild}) must be greater than the current build (${iosBuild}).`);
  }
}

let nextVersion = expo.version;
if (versionFlagIndex !== -1) {
  const value = args[versionFlagIndex + 1];
  if (!value) fail('--version requires a semver value (e.g. 1.2.0).');
  if (!parseSemver(value)) {
    fail(`--version must use major.minor.patch format. Received: ${value}`);
  }
  nextVersion = value;
}

const previous = {
  version: expo.version,
  buildNumber: iosBuild,
  versionCode: androidVersionCode,
};

const next = {
  version: nextVersion,
  buildNumber: nextBuild,
  versionCode: nextBuild,
};

console.log('Get Vaulted mobile version bump');
console.log(`  version:      ${previous.version} -> ${next.version}`);
console.log(`  iOS build:    ${previous.buildNumber} -> ${next.buildNumber}`);
console.log(`  Android code: ${previous.versionCode} -> ${next.versionCode}`);

if (dryRun) {
  console.log('Dry run only — app.json was not modified.');
  process.exit(0);
}

expo.version = next.version;
expo.ios.buildNumber = String(next.buildNumber);
expo.android.versionCode = next.versionCode;

writeFileSync(appJsonPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
console.log(`Updated ${appJsonPath}`);
