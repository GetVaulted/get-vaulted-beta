import { createClient, type User } from '@supabase/supabase-js';

export function createSupabaseService(url: string, serviceKey: string) {
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function getUserFromAuthHeader(
  url: string | undefined,
  anonKey: string | undefined,
  authorization: string | undefined,
): Promise<{ user: User } | { error: string; status: number }> {
  if (!authorization?.startsWith('Bearer ')) {
    return { error: 'Missing or invalid Authorization header', status: 401 };
  }
  const jwt = authorization.slice('Bearer '.length).trim();
  if (!jwt) {
    return { error: 'Empty bearer token', status: 401 };
  }
  if (!url || !anonKey) {
    return { error: 'Server missing Supabase anon configuration', status: 500 };
  }
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data.user) {
    return { error: error?.message ?? 'Invalid session', status: 401 };
  }
  return { user: data.user };
}
