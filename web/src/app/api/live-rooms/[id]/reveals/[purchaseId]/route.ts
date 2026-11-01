import { NextResponse } from "next/server";
import { buildRandomRevealSpinForPurchase } from "@/lib/live-item-variant-random-reveal";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";

export const runtime = "nodejs";

/**
 * The reveal for one of the signed-in buyer's own random-reveal purchases.
 *
 * The buyer's device calls this right after a successful random purchase so it can always play its
 * own reveal (Surprise Set card or reel), even if it missed the room's realtime broadcast.
 * 404 until the purchase has been revealed — clients retry briefly.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string; purchaseId: string }> }) {
  const { id: rawRoom, purchaseId: rawPurchase } = await ctx.params;
  const liveRoomId = decodeURIComponent(rawRoom);
  const purchaseId = decodeURIComponent(rawPurchase);

  const auth = await resolveLiveRoomsUserId(req);
  if (auth instanceof NextResponse) return auth;

  const result = await buildRandomRevealSpinForPurchase(purchaseId);
  if (!result || result.liveRoomId !== liveRoomId || result.buyerId !== auth.userId) {
    return NextResponse.json({ error: "Not revealed yet." }, { status: 404 });
  }
  return NextResponse.json({ spin: result.spin }, { headers: { "Cache-Control": "no-store" } });
}
