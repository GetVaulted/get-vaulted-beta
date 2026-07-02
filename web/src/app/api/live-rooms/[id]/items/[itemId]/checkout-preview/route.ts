import { NextResponse } from "next/server";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";
import { getLiveVariantCheckoutPreview } from "@/services/shipping/live-variant-checkout-preview";

export const runtime = "nodejs";

/** Buyer checkout preview: bundled live shipping + sales tax estimate for PYT/PYD spot purchase. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  const auth = await resolveLiveRoomsUserId(req);
  if (auth instanceof NextResponse) return auth;

  const { id: rawRoom, itemId: rawItem } = await ctx.params;
  const liveRoomId = decodeURIComponent(rawRoom);
  const liveRoomItemId = decodeURIComponent(rawItem);

  const { searchParams } = new URL(req.url);
  const itemPriceUsd = Number(searchParams.get("itemPriceUsd"));
  if (!Number.isFinite(itemPriceUsd) || itemPriceUsd <= 0) {
    return NextResponse.json({ error: "itemPriceUsd is required." }, { status: 400 });
  }

  try {
    const preview = await getLiveVariantCheckoutPreview({
      buyerId: auth.userId,
      liveRoomId,
      liveRoomItemId,
      itemPriceUsd,
    });
    if (!preview) {
      return NextResponse.json({ error: "Checkout preview unavailable." }, { status: 404 });
    }
    return NextResponse.json(preview);
  } catch (e) {
    console.error("[checkout-preview GET]", { liveRoomId, liveRoomItemId, itemPriceUsd, e });
    return NextResponse.json({ error: "Checkout preview failed." }, { status: 500 });
  }
}
