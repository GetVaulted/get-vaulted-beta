/**
 * Build a clean patch-package file for expo-realtime-ivs-broadcast with only
 * the source files we intentionally modified (no android/build junk).
 */
import { execFileSync, execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PKG = path.join(ROOT, 'node_modules', 'expo-realtime-ivs-broadcast');
const OUT = path.join(ROOT, 'patches', 'expo-realtime-ivs-broadcast+0.2.8.patch');

const SRC_FILES = [
  'android/src/main/java/expo/modules/realtimeivsbroadcast/ExpoRealtimeIvsBroadcastModule.kt',
  'android/src/main/java/expo/modules/realtimeivsbroadcast/IVSStageManager.kt',
  'build/index.d.ts',
  'build/index.js',
  'ios/ExpoRealtimeIvsBroadcastModule.swift',
  'ios/IVSStageManager.swift',
  'src/ExpoRealtimeIvsBroadcastModule.ts',
  'src/index.ts',
];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ivs-clean-'));
process.chdir(tmp);
execSync('npm pack expo-realtime-ivs-broadcast@0.2.8 --silent', { stdio: 'inherit' });
const tgz = fs.readdirSync(tmp).find((f) => f.endsWith('.tgz'));
execSync(`tar -xzf "${tgz}"`, { stdio: 'inherit' });
const cleanRoot = path.join(tmp, 'package');

const chunks = [];
for (const rel of SRC_FILES) {
  const dirty = path.join(PKG, rel);
  const clean = path.join(cleanRoot, rel);
  if (!fs.existsSync(dirty) || !fs.existsSync(clean)) {
    console.error('Missing file', rel);
    process.exit(1);
  }
  let diff = '';
  try {
    diff = execFileSync('git', ['diff', '--no-index', '--', clean, dirty], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (err) {
    // git diff --no-index exits 1 when files differ
    diff = err.stdout || '';
  }
  if (!diff.trim()) {
    console.log('unchanged', rel);
    continue;
  }
  const relUnix = rel.replace(/\\/g, '/');
  const a = `a/node_modules/expo-realtime-ivs-broadcast/${relUnix}`;
  const b = `b/node_modules/expo-realtime-ivs-broadcast/${relUnix}`;
  const rewritten = diff
    .replace(/^diff --git .+$/m, `diff --git ${a} ${b}`)
    .replace(/^--- .+$/m, `--- ${a}`)
    .replace(/^\+\+\+ .+$/m, `+++ ${b}`);
  chunks.push(rewritten.trimEnd());
  console.log('patched', rel);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, chunks.join('\n') + '\n');
console.log('Wrote', OUT, 'bytes=', fs.statSync(OUT).size);

try {
  fs.rmSync(tmp, { recursive: true, force: true });
} catch {
  /* Windows temp locks are fine — patch file is already written. */
}
