import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabaseAuthStorage } from './authSessionStorage';

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(url?.trim() && key?.trim());
}

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createClient(
      process.env.EXPO_PUBLIC_SUPABASE_URL as string,
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string,
      {
        auth: {
          storage: supabaseAuthStorage,
          persistSession: true,
          autoRefreshToken: true,
        },
      },
    );
  }
  return client;
}
