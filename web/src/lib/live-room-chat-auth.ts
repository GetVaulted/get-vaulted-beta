import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseBearerJwt, requestHasSupabaseBearer } from "@/lib/mobile-supabase-bearer";
import { requireUserIdFromSupabaseBearer } from "@/lib/require-supabase-bearer";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";

/**
 * Who is sending this chat message, as fast as possible.
 *
 * The general bearer check (`requireUserIdFromSupabaseBearer`) calls Supabase Auth over the network,
 * looks the user up several times and syncs Stripe Connect data. That is fine once per screen but it
 * was running on EVERY chat message, adding well over a second before anyone else saw the text.
 *
 * Here: skip the Stripe sync (irrelevant to chat) and remember a token that already passed for a
 * short time, so a burst of messages from one phone pays for auth once. Mutes, bans and slow mode
 * are still checked on every message by user id, so a cached token never bypasses moderation.
 */
export const CHAT_AUTH_CACHE_TTL_MS = 45_000;
const CHAT_AUTH_CACHE_MAX = 500;

const cache = new Map<string, { userId: string; expiresAt: number }>();

function tokenKey(jwt: string): string {
  return createHash("sha256").update(jwt).digest("hex");
}

/** Token expiry in ms from the JWT payload, or null when it cannot be read. */
function jwtExpiryMs(jwt: string): number | null {
  const part = jwt.split(".")[1];
  if (!part) return null;
  try {
    const json = JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as {
      exp?: unknown;
    };
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function clearChatAuthCache(): void {
  cache.clear();
}

export async function resolveChatSenderId(
  request: Request,
  now: () => number = Date.now,
): Promise<{ userId: string } | NextResponse> {
  const jwt = requestHasSupabaseBearer(request) ? getSupabaseBearerJwt(request) : null;
  if (!jwt) {
    // Website: cookie session, no network call involved.
    return resolveLiveRoomsUserId(request);
  }

  const key = tokenKey(jwt);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now()) return { userId: hit.userId };
  if (hit) cache.delete(key);

  const auth = await requireUserIdFromSupabaseBearer(request, { skipStripeSiblingSync: true });
  if (auth instanceof NextResponse) return auth;

  const exp = jwtExpiryMs(jwt);
  const expiresAt = Math.min(now() + CHAT_AUTH_CACHE_TTL_MS, exp ?? Number.POSITIVE_INFINITY);
  if (expiresAt > now()) {
    if (cache.size >= CHAT_AUTH_CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, { userId: auth.userId, expiresAt });
  }
  return { userId: auth.userId };
}
