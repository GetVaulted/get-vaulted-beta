import type { NextRequest } from "next/server";

/**
 * Buyer-visible live room reads that must stay public (no auth, no live gate):
 * - GET /api/live-rooms?limit=… (not mine=1)
 * - GET /api/live-rooms/{roomId} (room snapshot for mobile/web buyer)
 * - GET /api/live-rooms/{roomId}/share-meta (OG JSON for crawlers)
 * - GET /api/og/live/{showId} (dynamic share card image)
 */
export function isPublicLiveRoomsBuyerRead(request: Pick<NextRequest, "method" | "nextUrl">): boolean {
  if (request.method !== "GET") return false;
  const { pathname, searchParams } = request.nextUrl;
  if (pathname === "/api/live-rooms") {
    return searchParams.get("mine") !== "1";
  }
  if (/^\/api\/live-rooms\/[^/]+\/share-meta$/.test(pathname)) {
    return true;
  }
  return /^\/api\/live-rooms\/[^/]+$/.test(pathname);
}

/** Dynamic OG image cards must stay reachable for link previews when live is gated. */
export function isPublicLiveOgImageRoute(pathname: string): boolean {
  return /^\/api\/og\/live\/[^/]+$/.test(pathname);
}

/** Single-room share landing pages (link previews) stay public when live is gated. */
export function isPublicLiveRoomSharePage(pathname: string): boolean {
  return /^\/live\/[^/]+$/.test(pathname);
}
