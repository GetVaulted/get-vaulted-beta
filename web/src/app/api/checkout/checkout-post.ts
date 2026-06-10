import { NextResponse } from "next/server";
import { resolveListingsUserId } from "@/lib/resolve-listings-auth";
import { checkoutInfrastructureGate } from "@/lib/checkout-infrastructure";
import {
  createBreakSpotCheckoutSession,
  createBuyNowCheckoutSession,
  createPayOrderCheckoutSession,
} from "@/services/payments";
import { prisma } from "@/lib/prisma";
import { processAuctionPaymentExpiries } from "@/services/payments";
import { createLayawayDepositCheckout } from "@/services/layaway";
import { isValidLayawayPlan } from "@/lib/layaway/eligibility";
import type { LayawayPlanType } from "@/generated/prisma/client";

type Body = {
  kind?: string;
  listingId?: string;
  liveRoomItemId?: string;
  orderId?: string;
  breakSpotId?: string;
  planType?: string;
  termsAcknowledged?: boolean;
  successPath?: string;
  cancelPath?: string;
  shipping?: {
    buyerAddressId?: string;
    shipRecipientName?: string;
    shipAddress?: string;
    shipCity?: string;
    shipState?: string;
    shipZip?: string;
    shipCountry?: string;
  };
};

function trim(s: unknown, max = 500): string {
  if (typeof s !== "string") return "";
  return s.trim().slice(0, max);
}

export async function postMarketplaceCheckout(req: Request): Promise<Response> {
  const auth = await resolveListingsUserId(req);
  if (auth instanceof NextResponse) return auth;

  try {
    await processAuctionPaymentExpiries();
  } catch (e) {
    console.error("[checkout] processAuctionPaymentExpiries", e);
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const kind = trim(body.kind, 40);
  const buyerId = auth.userId;

  const gate = await checkoutInfrastructureGate(kind, {
    listingId: trim(body.listingId, 120) || undefined,
    orderId: trim(body.orderId, 120) || undefined,
  });
  if (gate) return gate;

  try {
    if (kind === "buy_now") {
      const listingId = trim(body.listingId, 120);
      const liveRoomItemId = body.liveRoomItemId ? trim(body.liveRoomItemId, 120) : null;
      const sh = body.shipping ?? {};
      const buyerAddressId =
        typeof sh.buyerAddressId === "string" && sh.buyerAddressId.trim().length > 0
          ? sh.buyerAddressId.trim()
          : null;
      const shipRecipientName = trim(sh.shipRecipientName, 200);
      const shipAddress = trim(sh.shipAddress, 500);
      const shipCity = trim(sh.shipCity, 120);
      const shipState = trim(sh.shipState, 120);
      const shipZip = trim(sh.shipZip, 32);
      const shipCountry = trim(sh.shipCountry, 120);
      if (!listingId) return NextResponse.json({ error: "listingId required." }, { status: 400 });
      let resolvedShipping = { shipRecipientName, shipAddress, shipCity, shipState, shipZip, shipCountry };
      if (buyerAddressId) {
        const addr = await prisma.address.findFirst({
          where: { id: buyerAddressId, userId: buyerId, type: "shipping" },
        });
        if (!addr) return NextResponse.json({ error: "Select a valid shipping address." }, { status: 400 });
        resolvedShipping = {
          shipRecipientName: addr.fullName || resolvedShipping.shipRecipientName,
          shipAddress: [addr.line1, addr.line2].filter(Boolean).join(" "),
          shipCity: addr.city,
          shipState: addr.state,
          shipZip: addr.postalCode,
          shipCountry: addr.country,
        };
      }
      if (!resolvedShipping.shipRecipientName || !resolvedShipping.shipAddress || !resolvedShipping.shipCity || !resolvedShipping.shipState || !resolvedShipping.shipZip || !resolvedShipping.shipCountry) {
        return NextResponse.json({ error: "Complete all shipping fields." }, { status: 400 });
      }
      const { url } = await createBuyNowCheckoutSession({
        buyerId,
        listingId,
        liveRoomItemId,
        shipping: { ...resolvedShipping, buyerAddressId },
        successPath: body.successPath,
        cancelPath: body.cancelPath,
      });
      return NextResponse.json({ url });
    }

    if (kind === "layaway_deposit") {
      const listingId = trim(body.listingId, 120);
      const planRaw = trim(body.planType, 20);
      if (!listingId) return NextResponse.json({ error: "listingId required." }, { status: 400 });
      if (!isValidLayawayPlan(planRaw)) {
        return NextResponse.json({ error: "Select a 30-day or 60-day layaway plan." }, { status: 400 });
      }
      if (!body.termsAcknowledged) {
        return NextResponse.json({ error: "Acknowledge layaway terms to continue." }, { status: 400 });
      }
      const sh = body.shipping ?? {};
      const buyerAddressId =
        typeof sh.buyerAddressId === "string" && sh.buyerAddressId.trim().length > 0
          ? sh.buyerAddressId.trim()
          : null;
      let resolvedShipping = {
        shipRecipientName: trim(sh.shipRecipientName, 200),
        shipAddress: trim(sh.shipAddress, 500),
        shipCity: trim(sh.shipCity, 120),
        shipState: trim(sh.shipState, 120),
        shipZip: trim(sh.shipZip, 32),
        shipCountry: trim(sh.shipCountry, 120),
      };
      if (buyerAddressId) {
        const addr = await prisma.address.findFirst({
          where: { id: buyerAddressId, userId: buyerId, type: "shipping" },
        });
        if (!addr) return NextResponse.json({ error: "Select a valid shipping address." }, { status: 400 });
        resolvedShipping = {
          shipRecipientName: addr.fullName || resolvedShipping.shipRecipientName,
          shipAddress: [addr.line1, addr.line2].filter(Boolean).join(" "),
          shipCity: addr.city,
          shipState: addr.state,
          shipZip: addr.postalCode,
          shipCountry: addr.country,
        };
      }
      if (
        !resolvedShipping.shipRecipientName ||
        !resolvedShipping.shipAddress ||
        !resolvedShipping.shipCity ||
        !resolvedShipping.shipState ||
        !resolvedShipping.shipZip ||
        !resolvedShipping.shipCountry
      ) {
        return NextResponse.json({ error: "Complete all shipping fields." }, { status: 400 });
      }
      const { url, layawayId } = await createLayawayDepositCheckout({
        buyerId,
        listingId,
        planType: planRaw as LayawayPlanType,
        termsAcknowledged: true,
        shipping: { ...resolvedShipping, buyerAddressId },
        successPath: body.successPath,
        cancelPath: body.cancelPath,
      });
      return NextResponse.json({ url, layawayId });
    }

    if (kind === "pay_order") {
      const orderId = trim(body.orderId, 120);
      if (!orderId) return NextResponse.json({ error: "orderId required." }, { status: 400 });
      const { url } = await createPayOrderCheckoutSession({
        buyerId,
        orderId,
        successPath: body.successPath,
        cancelPath: body.cancelPath,
      });
      return NextResponse.json({ url });
    }

    if (kind === "break_spot") {
      const breakSpotId = trim(body.breakSpotId, 120);
      if (!breakSpotId) return NextResponse.json({ error: "breakSpotId required." }, { status: 400 });
      const { url } = await createBreakSpotCheckoutSession({
        userId: buyerId,
        breakSpotId,
        successPath: body.successPath,
        cancelPath: body.cancelPath,
      });
      return NextResponse.json({ url });
    }

    return NextResponse.json({ error: "Invalid kind. Use buy_now, layaway_deposit, pay_order, or break_spot." }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    const map: Record<string, { status: number; msg: string }> = {
      NOT_BUY_NOW: { status: 400, msg: "This listing is not buy now." },
      NOT_AVAILABLE: { status: 409, msg: "This listing is not available." },
      OWN_LISTING: { status: 400, msg: "You cannot buy your own listing." },
      SELLER_NOT_READY: { status: 409, msg: "Seller has not finished Stripe Connect onboarding." },
      LIVE_ITEM_INVALID: { status: 400, msg: "That live item is not available for checkout." },
      ALREADY_SOLD: { status: 409, msg: "This item is already sold." },
      CHECKOUT_IN_PROGRESS: { status: 409, msg: "Checkout already in progress for this listing." },
      ORDER_NOT_FOUND: { status: 404, msg: "Order not found." },
      ORDER_PAYMENT_EXPIRED: { status: 409, msg: "Payment window expired." },
      SPOT_INVALID: { status: 400, msg: "Break spot not found." },
      ROOM_NOT_LIVE: { status: 409, msg: "Room is not live." },
      ALREADY_PAID: { status: 409, msg: "Already paid." },
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
      LISTING_INVENTORY_HELD: {
        status: 409,
        msg: "Someone else is checking out this item. Try again shortly or pick another lot.",
      },
      LIVE_ITEM_INVENTORY_HELD: {
        status: 409,
        msg: "This live lot is reserved by another buyer. Try again shortly.",
      },
      INVALID_ORDER_TOTAL: { status: 400, msg: "Invalid order total for this checkout path." },
      LAYAWAY_NOT_AVAILABLE: { status: 409, msg: "Layaway is not available for this listing." },
      BUYER_ACTIVE_LAYAWAY: {
        status: 409,
        msg: "You already have an active layaway. Complete or default it before starting another.",
      },
      TERMS_REQUIRED: { status: 400, msg: "Acknowledge layaway terms to continue." },
      INVALID_PLAN: { status: 400, msg: "Select a valid layaway plan." },
      LISTING_UNAVAILABLE: { status: 409, msg: "This listing is not available for layaway." },
    };
    const hit = map[msg];
    if (hit) return NextResponse.json({ error: hit.msg }, { status: hit.status });
    console.error("[checkout]", e);
    return NextResponse.json({ error: "Could not start checkout." }, { status: 500 });
  }
}
