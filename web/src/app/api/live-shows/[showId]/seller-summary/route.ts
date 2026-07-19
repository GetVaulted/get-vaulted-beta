import { NextResponse } from "next/server";
import { requireLiveRoomHostUser } from "@/lib/resolve-live-room-host-user";
import { safeDecodeRouteSegment } from "@/lib/live-loader-debug";
import { fetchLiveShowSellerSummary } from "@/lib/live-show-seller-summary";
import { apiErrorResponseFromUnknown } from "@/lib/prisma-api-error-response";

/**
 * Alias for product API naming: GET /api/live-shows/[showId]/seller-summary
 * (same auth + payload as /api/live-rooms/[id]/seller-summary).
 */
export async function GET(req: Request, ctx: { params: Promise<{ showId: string }> }) {
  const { showId: raw } = await ctx.params;
  const showId = safeDecodeRouteSegment(raw ?? "");

  try {
    const hostAuth = await requireLiveRoomHostUser(showId, req);
    if (hostAuth instanceof NextResponse) return hostAuth;

    const summary = await fetchLiveShowSellerSummary(showId);
    if (!summary) {
      return NextResponse.json({ error: "Live show not found." }, { status: 404 });
    }

    return NextResponse.json(summary, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return apiErrorResponseFromUnknown(e, { route: "live-shows/[showId]/seller-summary" });
  }
}
