import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { parseCreateLabelRequestBody } from "@/lib/shippo-label-format";
import { generateAdditionalBundledLabelForSession } from "@/services/shipping/bundled-labels";

export const runtime = "nodejs";

/**
 * POST /api/account/live-shipping/additional-label
 *
 * Buy ONE more label for a combined live bundle that already has its first label — for a buyer who won
 * several Surprise Set spins that ship in separate boxes (e.g. several helmets). Body:
 * `{ sessionId, parcel: { weightOz, lengthIn, widthIn, heightIn }, labelFormat?, preferredRate?: { objectId?, carrier?, service? } }`.
 *
 * One label per call, so a failure never leaves a half-bought set. Capped at one label per paid order;
 * the server refuses sessions without at least two Surprise Set wins.
 */
const CLIENT_ERROR_STATUS: Record<string, number> = {
  INVALID_PARCEL: 400,
  SESSION_NOT_FOUND: 404,
  NOT_A_COMBINED_BUNDLE_SESSION: 409,
  NO_PRIMARY_LABEL_YET: 409,
  NO_ELIGIBLE_ORDERS: 409,
  ADDITIONAL_LABELS_UNAVAILABLE: 409,
  ALL_LABELS_BOUGHT: 409,
  MISMATCHED_SHIP_TO_ADDRESSES: 409,
  SELLER_SHIP_FROM_INCOMPLETE: 400,
  SELLER_CONTACT_INCOMPLETE: 400,
  BUYER_CONTACT_INCOMPLETE: 400,
  SHIPPO_NOT_CONFIGURED: 503,
  LABEL_PURCHASE_NOT_CONFIRMED: 502,
};

const CODE_MESSAGES: Record<string, string> = {
  INVALID_PARCEL: "Enter a weight and box size for this label.",
  NO_PRIMARY_LABEL_YET: "Create the first label for this bundle before adding more.",
  ADDITIONAL_LABELS_UNAVAILABLE: "Extra labels are only available when a buyer won more than one Surprise Set spin.",
  ALL_LABELS_BOUGHT: "This bundle already has a label for every order.",
  LABEL_PURCHASE_NOT_CONFIRMED:
    "Shippo did not confirm the label purchase, so you were not charged. Try again, or check the Shippo dashboard.",
};

export async function POST(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  let body: {
    sessionId?: unknown;
    parcel?: { weightOz?: unknown; lengthIn?: unknown; widthIn?: unknown; heightIn?: unknown };
    labelFormat?: unknown;
    preferredRate?: { objectId?: unknown; carrier?: unknown; service?: unknown };
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "INVALID_JSON" }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  if (!sessionId) return NextResponse.json({ error: "sessionId is required.", code: "INVALID_PARCEL" }, { status: 400 });

  const mp = body.parcel ?? {};
  const parcel = {
    weightOz: Number(mp.weightOz),
    lengthIn: Number(mp.lengthIn),
    widthIn: Number(mp.widthIn),
    heightIn: Number(mp.heightIn),
  };

  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

  try {
    const result = await generateAdditionalBundledLabelForSession(sessionId, auth.userId, {
      parcel,
      labelFormat: parseCreateLabelRequestBody(body),
      preferredRate: {
        objectId: str(body.preferredRate?.objectId),
        carrier: str(body.preferredRate?.carrier),
        service: str(body.preferredRate?.service),
      },
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const code = e instanceof Error ? e.message : "UNKNOWN";
    const status = CLIENT_ERROR_STATUS[code];
    if (status) {
      return NextResponse.json({ error: CODE_MESSAGES[code] ?? code, code }, { status });
    }
    console.error("[api POST live-shipping/additional-label] failed", { sessionId, e });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not create the extra label.", code: "ADDITIONAL_LABEL_FAILED" },
      { status: 500 },
    );
  }
}
