import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { getOfferNextBidderPreview } from "@/services/auction-recovery";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: raw } = await ctx.params;
  const listingId = decodeURIComponent(raw);
  const actorIsAdmin = session.user.role === "admin";

  try {
    const preview = await getOfferNextBidderPreview({
      listingId,
      actorUserId: session.user.id,
      actorIsAdmin,
    });
    return NextResponse.json(preview);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    const map: Record<string, { status: number; msg: string }> = {
      NOT_FOUND: { status: 404, msg: "Not found." },
      FORBIDDEN: { status: 403, msg: "Forbidden." },
      INVALID_STATUS: { status: 409, msg: "Preview is only available when winner payment has expired." },
      NO_BACKUP_BIDDER: { status: 409, msg: "No backup bidder available." },
    };
    const hit = map[msg];
    if (hit) return NextResponse.json({ error: hit.msg, code: msg }, { status: hit.status });
    console.error("[listings/offer-next-bidder/preview]", e);
    return NextResponse.json({ error: "Could not load preview." }, { status: 500 });
  }
}
