import type { NextRequest } from "next/server";

/**
 * Buyer-visible live room reads that must stay public (no auth, no live gate):
 * - GET /api/live-rooms?limit=… (not mine=1)
 * - GET /api/live-rooms/{roomId} (room snapshot for mobile/web buyer)
 */
export function isPublicLiveRoomsBuyerRead(request: Pick<NextRequest, "method" | "nextUrl">): boolean {
  if (request.method !== "GET") return false;
  const { pathname, searchParams } = request.nextUrl;
  if (pathname === "/api/live-rooms") {
    return searchParams.get("mine") !== "1";
  }
  return /^\/api\/live-rooms\/[^/]+$/.test(pathname);
}
