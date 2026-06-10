import { useCallback, useEffect, useState } from 'react';
import { fetchWebApiAuthed } from '../lib/fetchWebApiAuthed';

let cached: { token: string; userId: string } | null = null;

/** Prisma user id for realtime channels — may differ from Supabase auth id on email-linked accounts. */
export function useCanonicalUserId(accessToken: string | undefined): string | undefined {
  const [userId, setUserId] = useState<string | undefined>(() =>
    accessToken && cached?.token === accessToken ? cached.userId : undefined,
  );

  useEffect(() => {
    if (!accessToken) {
      setUserId(undefined);
      return;
    }
    if (cached?.token === accessToken) {
      setUserId(cached.userId);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchWebApiAuthed('/api/account/identity', accessToken);
        const body = (await res.json()) as { userId?: string };
        if (!cancelled && res.ok && typeof body.userId === 'string' && body.userId.trim()) {
          cached = { token: accessToken, userId: body.userId.trim() };
          setUserId(cached.userId);
        }
      } catch {
        /* fallback handled by callers */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  return userId;
}

export function clearCanonicalUserIdCache(): void {
  cached = null;
}

export function resolveRealtimeUserId(
  canonicalUserId: string | undefined,
  supabaseUserId: string | undefined,
): string | undefined {
  return canonicalUserId ?? supabaseUserId;
}
