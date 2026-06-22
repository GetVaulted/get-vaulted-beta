import { fetchBuyerLiveStream, fetchViewerStageToken } from '../api/liveRoomStreamRepository';
import {
  isLiveStreamSignal,
  shouldUseStageWebrtcPlayback,
  type BuyerSafeStreamFields,
} from './liveStreamPlayback';

const STREAM_TTL_MS = 5_000;
const TOKEN_TTL_MS = 15 * 60 * 1000;

type StreamEntry = { value: BuyerSafeStreamFields; fetchedAt: number };
type TokenEntry = { token: string; fetchedAt: number };

const streamCache = new Map<string, StreamEntry>();
const tokenCache = new Map<string, TokenEntry>();
const streamInflight = new Map<string, Promise<BuyerSafeStreamFields | null>>();
const tokenInflight = new Map<string, Promise<string | null>>();

export function peekCachedBuyerLiveStream(roomId: string): BuyerSafeStreamFields | null {
  const hit = streamCache.get(roomId);
  if (!hit) return null;
  if (Date.now() - hit.fetchedAt > STREAM_TTL_MS * 3) return null;
  return hit.value;
}

export function peekPrefetchedViewerStageToken(roomId: string): string | null {
  const hit = tokenCache.get(roomId);
  if (!hit) return null;
  if (Date.now() - hit.fetchedAt > TOKEN_TTL_MS) return null;
  return hit.token;
}

async function warmStageToken(roomId: string, accessToken: string): Promise<string | null> {
  const existing = peekPrefetchedViewerStageToken(roomId);
  if (existing) return existing;

  const inflight = tokenInflight.get(roomId);
  if (inflight) return inflight;

  const job = (async () => {
    try {
      const payload = await fetchViewerStageToken(roomId, accessToken);
      if (!payload?.token) return null;
      tokenCache.set(roomId, { token: payload.token, fetchedAt: Date.now() });
      return payload.token;
    } catch {
      return null;
    } finally {
      tokenInflight.delete(roomId);
    }
  })();

  tokenInflight.set(roomId, job);
  return job;
}

async function warmStream(roomId: string, accessToken?: string): Promise<BuyerSafeStreamFields | null> {
  const fresh = streamCache.get(roomId);
  if (fresh && Date.now() - fresh.fetchedAt < STREAM_TTL_MS) {
    return fresh.value;
  }

  const inflight = streamInflight.get(roomId);
  if (inflight) return inflight;

  const job = (async () => {
    try {
      const value = await fetchBuyerLiveStream(roomId, accessToken);
      if (value) {
        streamCache.set(roomId, { value, fetchedAt: Date.now() });
        if (
          accessToken?.trim() &&
          isLiveStreamSignal(value.streamHealth) &&
          shouldUseStageWebrtcPlayback(value, false, accessToken)
        ) {
          void warmStageToken(roomId, accessToken);
        }
      }
      return value;
    } catch {
      return null;
    } finally {
      streamInflight.delete(roomId);
    }
  })();

  streamInflight.set(roomId, job);
  return job;
}

/** Parallel warm-up for the live feed pager — stream metadata + optional Stage tokens. */
export function prefetchLiveStreamRooms(roomIds: string[], accessToken?: string): void {
  const unique = [...new Set(roomIds.filter(Boolean))];
  for (const roomId of unique) {
    void warmStream(roomId, accessToken);
  }
}

/** Cache-first stream read used by the playback hook (Whatnot-style instant swipe). */
export async function getBuyerLiveStreamCached(
  roomId: string,
  accessToken?: string,
): Promise<BuyerSafeStreamFields | null> {
  return warmStream(roomId, accessToken);
}

/** Stage subscribe hook — returns a prefetched token when still valid. */
export async function resolveViewerStageToken(
  roomId: string,
  accessToken: string,
): Promise<string | null> {
  const cached = peekPrefetchedViewerStageToken(roomId);
  if (cached) return cached;
  return warmStageToken(roomId, accessToken);
}
