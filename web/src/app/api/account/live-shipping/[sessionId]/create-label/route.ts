import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { generateBundledShippoLabelForSession } from "@/services/shipping/bundled-labels";
import { parseCreateLabelRequestBody } from "@/lib/shippo-label-format";
import { SELLER_SHIPPO_CONTACT_MISSING, BUYER_SHIPPO_CONTACT_MISSING } from "@/lib/shippo-label-contacts";

export const runtime = "nodejs";

/**
 * Seller: purchase one Shippo label for a combined live shipping session (all eligible paid orders).
 */
export async function POST(req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId: raw } = await ctx.params;
  const sessionId = decodeURIComponent(raw);

  try {
    const body = (await req.json().catch(() => ({}))) as {
      labelFormat?: string;
      selectedRateObjectId?: unknown;
      manualParcel?: { weightOz?: unknown; lengthIn?: unknown; widthIn?: unknown; heightIn?: unknown };
    };
    const labelFormat = parseCreateLabelRequestBody(body);
    const selectedRateObjectId =
      typeof body.selectedRateObjectId === "string" && body.selectedRateObjectId.trim()
        ? body.selectedRateObjectId.trim()
        : undefined;

    // Optional seller-confirmed package dimensions (bypasses calculated package groups).
    const mp = body.manualParcel;
    const manualParcel =
      mp &&
      typeof mp.weightOz === "number" && mp.weightOz > 0 &&
      typeof mp.lengthIn === "number" && mp.lengthIn > 0 &&
      typeof mp.widthIn === "number" && mp.widthIn > 0 &&
      typeof mp.heightIn === "number" && mp.heightIn > 0
        ? {
            weightOz: Math.max(0.1, Number(mp.weightOz)),
            lengthIn: Math.max(0.1, Number(mp.lengthIn)),
            widthIn: Math.max(0.1, Number(mp.widthIn)),
            heightIn: Math.max(0.1, Number(mp.heightIn)),
          }
        : undefined;

    const result = await generateBundledShippoLabelForSession(sessionId, session.user.id, {
      labelFormat,
      manualParcel,
      selectedRateObjectId,
    });
    if (!result.labelUrl && !result.alreadyExisted) {
      return NextResponse.json({
        ...result,
        warning:
          "Shippo accepted the purchase but no PDF label URL was returned. Confirm SHIPPO_API_TOKEN (test or live), ship-from address, and buyer ship-to — then use Repair label on the order if needed.",
      });
    }
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = msg;
    if (code === "SESSION_NOT_FOUND") {
      return NextResponse.json({ error: "Session not found.", code }, { status: 404 });
    }
    if (code === "NOT_A_COMBINED_BUNDLE_SESSION") {
      return NextResponse.json(
        { error: "Bundled labels are only available for combined live shipping sessions.", code },
        { status: 400 },
      );
    }
    if (code === "NO_ELIGIBLE_ORDERS") {
      return NextResponse.json(
        { error: "No paid, unlabeled, non-ship-alone orders in this session.", code },
        { status: 400 },
      );
    }
    if (code === "SHIPPO_NOT_CONFIGURED") {
      return NextResponse.json({ error: "Shippo is not configured.", code }, { status: 503 });
    }
    if (code === "SELLER_SHIP_FROM_INCOMPLETE") {
      return NextResponse.json(
        { error: "Complete your ship-from address under Account → Seller before creating labels.", code },
        { status: 400 },
      );
    }
    if (code === SELLER_SHIPPO_CONTACT_MISSING) {
      return NextResponse.json({ error: msg, code: "SELLER_CONTACT_INCOMPLETE" }, { status: 422 });
    }
    if (code === BUYER_SHIPPO_CONTACT_MISSING) {
      return NextResponse.json({ error: msg, code: "BUYER_CONTACT_INCOMPLETE" }, { status: 422 });
    }
    if (code === "MISMATCHED_SHIP_TO_ADDRESSES") {
      return NextResponse.json(
        { error: "Eligible orders in this session use different ship-to addresses; resolve before bundling.", code },
        { status: 400 },
      );
    }
    console.error("[live-shipping/create-label]", e);
    return NextResponse.json({ error: msg || "Bundled label creation failed.", code }, { status: 500 });
  }
}
