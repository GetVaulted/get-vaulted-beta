import { NextResponse } from "next/server";
import { requireLiveRoomHostUser } from "@/lib/resolve-live-room-host-user";
import { safeDecodeRouteSegment } from "@/lib/live-loader-debug";
import { fetchLiveShowSellerSummary } from "@/lib/live-show-seller-summary";
import { apiErrorResponseFromUnknown } from "@/lib/prisma-api-error-response";

/**
 * GET /api/live-rooms/[id]/seller-summary
 * Host/admin-only authoritative show sales + current fee-tier snapshot.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const liveRoomId = safeDecodeRouteSegment(raw ?? "");

  try {
    const hostAuth = await requireLiveRoomHostUser(liveRoomId, req);
    if (hostAuth instanceof NextResponse) return hostAuth;

    const summary = await fetchLiveShowSellerSummary(liveRoomId);
    if (!summary) {
      return NextResponse.json({ error: "Live show not found." }, { status: 404 });
    }

    return NextResponse.json(summary, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return apiErrorResponseFromUnknown(e, { route: "live-rooms/[id]/seller-summary" });
  }
}
