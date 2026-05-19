import { NextResponse } from "next/server";
import { resolveListingsUserId } from "@/lib/resolve-listings-auth";
import { sellerEndListing } from "@/lib/listing-end-service";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveListingsUserId(req);
  if (auth instanceof NextResponse) return auth;

  const { id: raw } = await ctx.params;
  const listingId = decodeURIComponent(raw);

  try {
    await sellerEndListing(listingId, auth.userId);
    return NextResponse.json({ ok: true, status: "ended" });
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    const map: Record<string, { status: number; error: string; code: string }> = {
      NOT_FOUND: { status: 404, error: "Listing not found.", code: "NOT_FOUND" },
      INVALID_STATUS: { status: 409, error: "This listing cannot be ended in its current state.", code: "INVALID_STATUS" },
      AUCTION_HAS_BIDS: {
        status: 409,
        error: "Auctions with active bids require an admin-reviewed end request.",
        code: "AUCTION_HAS_BIDS",
      },
    };
    const hit = map[code];
    if (hit) return NextResponse.json({ error: hit.error, code: hit.code }, { status: hit.status });
    console.error("[POST /api/listings/[id]/end]", e);
    return NextResponse.json({ error: "Could not end listing." }, { status: 500 });
  }
}
