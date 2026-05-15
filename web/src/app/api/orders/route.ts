import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { checkoutInfrastructureGate } from "@/lib/checkout-infrastructure";
import { createBuyNowCheckoutSession } from "@/services/payments";

type OrderBody = {
  listingId?: string;
  liveRoomItemId?: string;
  shipRecipientName?: string;
  shipAddress?: string;
  shipCity?: string;
  shipState?: string;
  shipZip?: string;
  shipCountry?: string;
  paymentLabel?: string;
  successPath?: string;
  cancelPath?: string;
};

function trim(s: unknown, max = 500): string {
  if (typeof s !== "string") return "";
  return s.trim().slice(0, max);
}

/**
 * Buy now: creates a pending `Order` and returns Stripe Checkout (MVP default).
 * When `ESCROW_ENABLED=true` and provider env is set, high-value totals may use the optional alternate checkout path.
 */
export async function POST(req: Request) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: OrderBody;
  try {
    body = (await req.json()) as OrderBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const listingId = trim(body.listingId, 120);
  const liveRoomItemId = trim(body.liveRoomItemId, 120);
  const shipRecipientName = trim(body.shipRecipientName, 200);
  const shipAddress = trim(body.shipAddress, 500);
  const shipCity = trim(body.shipCity, 120);
  const shipState = trim(body.shipState, 120);
  const shipZip = trim(body.shipZip, 32);
  const shipCountry = trim(body.shipCountry, 120);

  if (!listingId) return NextResponse.json({ error: "Missing listing." }, { status: 400 });
  if (!shipRecipientName || !shipAddress || !shipCity || !shipState || !shipZip || !shipCountry) {
    return NextResponse.json({ error: "Complete all shipping fields." }, { status: 400 });
  }

  const infra = await checkoutInfrastructureGate("buy_now", { listingId });
  if (infra) return infra;

  const buyerId = session.user.id;

  try {
    const { url } = await createBuyNowCheckoutSession({
      buyerId,
      listingId,
      liveRoomItemId: liveRoomItemId || null,
      shipping: { shipRecipientName, shipAddress, shipCity, shipState, shipZip, shipCountry },
      successPath: body.successPath,
      cancelPath: body.cancelPath,
    });
    return NextResponse.json({ url });
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    const map: Record<string, { status: number; msg: string }> = {
      NOT_BUY_NOW: { status: 400, msg: "This listing is not buy now." },
      NOT_AVAILABLE: { status: 409, msg: "This listing is not available." },
      OWN_LISTING: { status: 400, msg: "You cannot buy your own listing." },
      SELLER_NOT_READY: { status: 409, msg: "Seller has not finished Stripe Connect onboarding." },
      LIVE_ITEM_INVALID: { status: 400, msg: "That live item is not available for checkout." },
      ALREADY_SOLD: { status: 409, msg: "This item is already sold." },
      CHECKOUT_IN_PROGRESS: { status: 409, msg: "Checkout already in progress for this listing." },
      ESCROW_NOT_CONFIGURED: {
        status: 503,
        msg: "Optional high-value checkout is not configured. Set ESCROW_ENABLED=true and provider env vars (see .env.example), or use Stripe checkout.",
      },
      ESCROW_PROVIDER_UNSUPPORTED: { status: 503, msg: "Payment provider for this path is not supported." },
      TRUSTAP_SELLER_NOT_LINKED: {
        status: 409,
        msg: "Seller must complete required payout linkage before checkout for this order total.",
      },
      TRUSTAP_BUYER_NOT_LINKED: { status: 409, msg: "Buyer profile for this checkout path could not be created." },
      INVALID_ORDER_TOTAL: { status: 400, msg: "Invalid order total for this checkout path." },
    };
    const hit = map[code];
    if (hit) return NextResponse.json({ error: hit.msg }, { status: hit.status });
    console.error("[api/orders POST]", e);
    return NextResponse.json({ error: "Could not start checkout." }, { status: 500 });
  }
}
