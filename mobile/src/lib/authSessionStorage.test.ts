import { beforeEach, describe, expect, it, vi } from 'vitest';

const files = new Map<string, string>();
const failReads = new Set<string>();
let writeLog: string[] = [];

vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///doc/',
  cacheDirectory: 'file:///cache/',
  getInfoAsync: vi.fn(async (p: string) => ({ exists: files.has(p) })),
  readAsStringAsync: vi.fn(async (p: string) => {
    if (failReads.has(p)) throw new Error('io error');
    return files.get(p) ?? '';
  }),
  writeAsStringAsync: vi.fn(async (p: string, v: string) => {
    writeLog.push(p);
    await new Promise((r) => setTimeout(r, 2));
    files.set(p, v);
  }),
}));
vi.mock('./authDiagnostics', () => ({ reportAuthDiagnostic: vi.fn() }));

const PRIMARY = 'file:///doc/gv-auth-store-v1.json';
const BACKUP = 'file:///doc/gv-auth-store-v1.bak.json';
const good = (token: string) => JSON.stringify({ v: 1, keepLoggedIn: '1', kv: { 'sb-x-auth-token': token } });

async function freshModule() {
  vi.resetModules();
  return import('./authSessionStorage');
}

describe('supabaseAuthStorage', () => {
  beforeEach(async () => {
    // Let any background repair write from the previous test finish before resetting.
    await new Promise((r) => setTimeout(r, 40));
    files.clear();
    failReads.clear();
    writeLog = [];
  });

  it('returns null on a fresh install', async () => {
    const { supabaseAuthStorage } = await freshModule();
    expect(await supabaseAuthStorage.getItem('sb-x-auth-token')).toBeNull();
  });

  it('keeps the login when the main file is corrupt but the backup is intact', async () => {
    files.set(PRIMARY, '{"v":1,"keepLoggedIn":"1","kv":{"sb-x-auth-tok'); // truncated mid-write
    files.set(BACKUP, good('session-json'));
    const { supabaseAuthStorage } = await freshModule();
    expect(await supabaseAuthStorage.getItem('sb-x-auth-token')).toBe('session-json');
  });

  it('survives a main file that cannot be read right now', async () => {
    files.set(PRIMARY, good('session-json'));
    files.set(BACKUP, good('session-json'));
    failReads.add(PRIMARY);
    const { supabaseAuthStorage } = await freshModule();
    expect(await supabaseAuthStorage.getItem('sb-x-auth-token')).toBe('session-json');
  });

  it('writes the main file then the backup, one sequence at a time, ending with every key saved', async () => {
    const { supabaseAuthStorage } = await freshModule();
    await Promise.all([
      supabaseAuthStorage.setItem('sb-x-auth-token', 'a'),
      supabaseAuthStorage.setItem('sb-x-auth-token-user', 'b'),
      supabaseAuthStorage.setItem('sb-x-auth-token', 'c'),
    ]);
    for (let i = 0; i < writeLog.length; i += 2) {
      expect(writeLog[i]).toBe(PRIMARY);
      expect(writeLog[i + 1]).toBe(BACKUP);
    }
    const saved = JSON.parse(files.get(PRIMARY) ?? '{}');
    expect(saved.kv).toEqual({ 'sb-x-auth-token': 'c', 'sb-x-auth-token-user': 'b' });
    expect(files.get(BACKUP)).toBe(files.get(PRIMARY));
  });

  it('removeItem deletes the key from both copies', async () => {
    files.set(PRIMARY, good('x'));
    files.set(BACKUP, good('x'));
    const { supabaseAuthStorage } = await freshModule();
    await supabaseAuthStorage.removeItem('sb-x-auth-token');
    expect(JSON.parse(files.get(PRIMARY) ?? '{}').kv).toEqual({});
    expect(JSON.parse(files.get(BACKUP) ?? '{}').kv).toEqual({});
  });
});
