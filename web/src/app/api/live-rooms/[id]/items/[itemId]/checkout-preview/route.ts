import { NextResponse } from "next/server";
import { getServerSessionSafe } from "@/lib/auth";
import { getLiveVariantCheckoutPreview } from "@/services/shipping/live-variant-checkout-preview";

export const runtime = "nodejs";

/** Buyer checkout preview: bundled live shipping + sales tax estimate for PYT/PYD spot purchase. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: rawRoom, itemId: rawItem } = await ctx.params;
  const liveRoomId = decodeURIComponent(rawRoom);
  const liveRoomItemId = decodeURIComponent(rawItem);

  const { searchParams } = new URL(req.url);
  const itemPriceUsd = Number(searchParams.get("itemPriceUsd"));
  if (!Number.isFinite(itemPriceUsd) || itemPriceUsd <= 0) {
    return NextResponse.json({ error: "itemPriceUsd is required." }, { status: 400 });
  }

  const preview = await getLiveVariantCheckoutPreview({
    buyerId: session.user.id,
    liveRoomId,
    liveRoomItemId,
    itemPriceUsd,
  });
  if (!preview) {
    return NextResponse.json({ error: "Checkout preview unavailable." }, { status: 404 });
  }

  return NextResponse.json(preview);
}
