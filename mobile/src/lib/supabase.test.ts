import { describe, expect, it, vi } from 'vitest';

vi.mock('./authSessionStorage', () => ({
  supabaseAuthStorage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({})),
}));

import { isPlausibleSupabaseAnonKey } from './supabase';

describe('isPlausibleSupabaseAnonKey', () => {
  it('accepts publishable keys', () => {
    expect(isPlausibleSupabaseAnonKey('sb_publishable_KS2VWV2UL3qH0PRkBcBX9A_mC-WzF46')).toBe(true);
  });

  it('accepts legacy JWT anon keys', () => {
    expect(
      isPlausibleSupabaseAnonKey(
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhrYWFpY29ramdtcGJjdGZlcm1qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MTcxMjAsImV4cCI6MjA4OTQ5MzEyMH0.Xv20DDPE_66EW7T1-qIKfrJKhbj-uya8lqP2RoAEHZw',
      ),
    ).toBe(true);
  });

  it('rejects placeholders and garbage', () => {
    expect(isPlausibleSupabaseAnonKey('your_anon_key')).toBe(false);
    expect(isPlausibleSupabaseAnonKey('')).toBe(false);
    expect(isPlausibleSupabaseAnonKey('sb_publishable_x')).toBe(false);
  });
});
