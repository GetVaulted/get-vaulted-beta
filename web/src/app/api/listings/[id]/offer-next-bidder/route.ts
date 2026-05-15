import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { offerAuctionToNextBidder } from "@/services/auction-recovery";

export const runtime = "nodejs";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: raw } = await ctx.params;
  const listingId = decodeURIComponent(raw);
  const actorIsAdmin = session.user.role === "admin";

  try {
    const { orderId } = await offerAuctionToNextBidder({
      listingId,
      actorUserId: session.user.id,
      actorIsAdmin,
    });
    return NextResponse.json({ ok: true, orderId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    const map: Record<string, { status: number; msg: string }> = {
      NOT_FOUND: { status: 404, msg: "Not found." },
      FORBIDDEN: { status: 403, msg: "Forbidden." },
      INVALID_STATUS: { status: 409, msg: "Offer to next bidder is only available after winner payment expired." },
      NO_BACKUP_BIDDER: { status: 409, msg: "No backup bidder available." },
    };
    const hit = map[msg];
    if (hit) return NextResponse.json({ error: hit.msg, code: msg }, { status: hit.status });
    console.error("[listings/offer-next-bidder]", e);
    return NextResponse.json({ error: "Could not offer to next bidder." }, { status: 500 });
  }
}
