import { NextResponse } from "next/server";
import { resolveListingsUserId } from "@/lib/resolve-listings-auth";
import { confirmMarketplaceCheckoutSessionFromRedirect } from "@/services/payments";

export const runtime = "nodejs";

type Body = { sessionId?: string };

export async function POST(req: Request): Promise<Response> {
  const auth = await resolveListingsUserId(req);
  if (auth instanceof NextResponse) return auth;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required." }, { status: 400 });
  }

  try {
    const result = await confirmMarketplaceCheckoutSessionFromRedirect(sessionId, auth.userId);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    const map: Record<string, { status: number; error: string }> = {
      SESSION_ID_REQUIRED: { status: 400, error: "sessionId required." },
      CHECKOUT_NOT_PAID: { status: 409, error: "Checkout is not paid yet." },
      UNSUPPORTED_CHECKOUT_KIND: { status: 400, error: "This checkout session cannot be confirmed here." },
      ORDER_NOT_FOUND: { status: 404, error: "Order not found." },
      FORBIDDEN: { status: 403, error: "You do not have access to this checkout." },
    };
    const hit = map[msg];
    if (hit) return NextResponse.json({ error: hit.error }, { status: hit.status });
    console.error("[checkout/confirm]", e);
    return NextResponse.json({ error: "Could not confirm checkout." }, { status: 500 });
  }
}
