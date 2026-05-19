import { NextResponse } from "next/server";
import { resolveListingsUserId } from "@/lib/resolve-listings-auth";
import {
  cancelListingEndRequestBySeller,
  createListingEndRequest,
  getLatestEndRequestForListing,
  parseReasonCategory,
} from "@/lib/listing-end-service";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveListingsUserId(req);
  if (auth instanceof NextResponse) return auth;

  const { id: raw } = await ctx.params;
  const listingId = decodeURIComponent(raw);

  const endRequest = await getLatestEndRequestForListing(listingId);
  if (!endRequest || endRequest.sellerId !== auth.userId) {
    return NextResponse.json({ endRequest: null });
  }
  return NextResponse.json({ endRequest });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveListingsUserId(req);
  if (auth instanceof NextResponse) return auth;

  const { id: raw } = await ctx.params;
  const listingId = decodeURIComponent(raw);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const reasonCategory = parseReasonCategory(body.reasonCategory);
  if (!reasonCategory) {
    return NextResponse.json({ error: "Invalid reason category." }, { status: 400 });
  }
  const reasonText = typeof body.reasonText === "string" ? body.reasonText : "";

  try {
    const endRequest = await createListingEndRequest({
      listingId,
      sellerId: auth.userId,
      reasonCategory,
      reasonText,
    });
    return NextResponse.json({ endRequest });
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    const map: Record<string, { status: number; error: string; code: string }> = {
      NOT_FOUND: { status: 404, error: "Listing not found.", code: "NOT_FOUND" },
      NOT_AUCTION: { status: 409, error: "End requests apply to live auctions only.", code: "NOT_AUCTION" },
      NO_BIDS_USE_END: {
        status: 409,
        error: "No bids yet — you can end this auction directly.",
        code: "NO_BIDS_USE_END",
      },
      REQUEST_ALREADY_PENDING: {
        status: 409,
        error: "An end request is already pending review.",
        code: "REQUEST_ALREADY_PENDING",
      },
      REASON_TOO_SHORT: {
        status: 400,
        error: "Please provide at least 10 characters explaining why you need to end this auction.",
        code: "REASON_TOO_SHORT",
      },
    };
    const hit = map[code];
    if (hit) return NextResponse.json({ error: hit.error, code: hit.code }, { status: hit.status });
    console.error("[POST /api/listings/[id]/end-request]", e);
    return NextResponse.json({ error: "Could not submit end request." }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveListingsUserId(req);
  if (auth instanceof NextResponse) return auth;

  const { id: raw } = await ctx.params;
  const listingId = decodeURIComponent(raw);
  const url = new URL(req.url);
  const requestId = url.searchParams.get("requestId")?.trim();

  const latest = await getLatestEndRequestForListing(listingId);
  const targetId = requestId || latest?.id;
  if (!targetId) return NextResponse.json({ error: "No pending request." }, { status: 404 });

  try {
    const endRequest = await cancelListingEndRequestBySeller(targetId, auth.userId);
    return NextResponse.json({ endRequest });
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    if (code === "NOT_FOUND") {
      return NextResponse.json({ error: "Pending request not found." }, { status: 404 });
    }
    console.error("[DELETE /api/listings/[id]/end-request]", e);
    return NextResponse.json({ error: "Could not cancel request." }, { status: 500 });
  }
}
