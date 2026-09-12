import { NextResponse } from "next/server";
import { getServerSessionSafe } from "@/lib/auth";
import { previewBundledShippoRatesForSession } from "@/services/shipping/bundled-labels";
import { SELLER_SHIPPO_CONTACT_MISSING, BUYER_SHIPPO_CONTACT_MISSING } from "@/lib/shippo-label-contacts";

export const runtime = "nodejs";

/** Seller: quote Shippo rates for a bundled session parcel without purchasing. */
export async function POST(req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId: raw } = await ctx.params;
  const sessionId = decodeURIComponent(raw);

  try {
    const body = (await req.json().catch(() => ({}))) as {
      weightOz?: unknown;
      lengthIn?: unknown;
      widthIn?: unknown;
      heightIn?: unknown;
    };
    const weightOz = Number(body.weightOz);
    const lengthIn = Number(body.lengthIn);
    const widthIn = Number(body.widthIn);
    const heightIn = Number(body.heightIn);
    if (![weightOz, lengthIn, widthIn, heightIn].every((n) => Number.isFinite(n) && n > 0)) {
      return NextResponse.json({ error: "Enter a valid weight and dimensions." }, { status: 400 });
    }

    const result = await previewBundledShippoRatesForSession(sessionId, session.user.id, {
      weightOz: Math.max(0.1, weightOz),
      lengthIn: Math.max(0.1, lengthIn),
      widthIn: Math.max(0.1, widthIn),
      heightIn: Math.max(0.1, heightIn),
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "SESSION_NOT_FOUND") {
      return NextResponse.json({ error: "Session not found.", code: msg }, { status: 404 });
    }
    if (msg === "NOT_A_COMBINED_BUNDLE_SESSION") {
      return NextResponse.json({ error: "Bundled rates are only for combined sessions.", code: msg }, { status: 400 });
    }
    if (msg === "NO_ELIGIBLE_ORDERS") {
      return NextResponse.json({ error: "No paid unlabeled orders in this session.", code: msg }, { status: 400 });
    }
    if (msg === "SHIPPO_NOT_CONFIGURED") {
      return NextResponse.json({ error: "Shippo is not configured.", code: msg }, { status: 503 });
    }
    if (msg === "SELLER_SHIP_FROM_INCOMPLETE") {
      return NextResponse.json(
        { error: "Complete your ship-from address under Account → Seller first.", code: msg },
        { status: 400 },
      );
    }
    if (msg === SELLER_SHIPPO_CONTACT_MISSING || msg === BUYER_SHIPPO_CONTACT_MISSING) {
      return NextResponse.json({ error: msg }, { status: 422 });
    }
    if (msg === "MISMATCHED_SHIP_TO_ADDRESSES") {
      return NextResponse.json({ error: "Orders use different ship-to addresses.", code: msg }, { status: 400 });
    }
    console.error("[live-shipping/preview-rates]", e);
    return NextResponse.json({ error: msg || "Could not quote rates." }, { status: 500 });
  }
}
