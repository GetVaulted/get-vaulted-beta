import { useEffect, useState } from 'react';
import { fetchWebApiMobile } from '../lib/fetchWebApiMobile';

let cachedTopBuyerId: string | null | undefined;
let inflight: Promise<string | null> | null = null;

async function loadTopBuyerId(): Promise<string | null> {
  try {
    const res = await fetchWebApiMobile('/api/live/top-buyer');
    if (!res.ok) return null;
    const j = (await res.json()) as { userId?: unknown };
    return typeof j?.userId === 'string' ? j.userId : null;
  } catch {
    return null;
  }
}

/**
 * User id of the platform's top buyer (most paid orders, all-time), for the chat badge.
 * Fetched once per app session and shared by every chat row; the endpoint is edge-cached.
 */
export function useTopBuyerId(): string | null {
  const [id, setId] = useState<string | null>(cachedTopBuyerId ?? null);
  useEffect(() => {
    if (cachedTopBuyerId !== undefined) {
      setId(cachedTopBuyerId);
      return;
    }
    let alive = true;
    inflight ??= loadTopBuyerId().then((v) => {
      // Only cache a real answer; a failed fetch retries on the next mount.
      if (v) cachedTopBuyerId = v;
      else inflight = null;
      return v;
    });
    void inflight.then((v) => {
      if (alive) setId(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  return id;
}
