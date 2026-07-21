import { NextResponse } from "next/server";
import { resolveListingsUserId } from "@/lib/resolve-listings-auth";
import { checkoutInfrastructureGate } from "@/lib/checkout-infrastructure";
import { stripeRouteErrorResponse } from "@/lib/stripe-route-errors";
import { getStripePublishableKey } from "@/lib/stripe";
import {
  createBreakSpotCheckoutSession,
  createBuyNowCheckoutSession,
  createPayOrderCheckoutSession,
  type BuyNowEmbeddedCheckoutResult,
} from "@/services/payments";
import { prisma } from "@/lib/prisma";
import { processAuctionPaymentExpiries } from "@/services/payments";
import { createLayawayDepositCheckout } from "@/services/layaway";
import { isValidLayawayPlan } from "@/lib/layaway/eligibility";
import { CommerceGuardError, commerceGuardErrorToHttp } from "@/lib/marketplace/commerce-guards";
import type { LayawayPlanType } from "@/generated/prisma/client";
import { ensureMarketplacePlatformFeeCache } from "@/services/platform-fee-settings";
import { ensureLiveShowFeeCache } from "@/services/live-show-fee-settings";
import { ensurePayoutProgramCache } from "@/services/payout/payout-program-settings";

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
    selectedShippingRateId?: string;
  };
  selectedShippingRateId?: string;
  embedded?: boolean;
  paymentMethodId?: string;
  /** Buyer opt-in to spend available referral credit on this checkout. */
  applyReferralCredit?: boolean;
};

function trim(s: unknown, max = 500): string {
  if (typeof s !== "string") return "";
  return s.trim().slice(0, max);
}

function jsonEmbeddedBuyNowResult(result: BuyNowEmbeddedCheckoutResult) {
  const publishableKey = getStripePublishableKey();
  if ("requiresAction" in result && result.requiresAction && !publishableKey) {
    return NextResponse.json(
      { error: "Stripe publishable key is missing. Set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY." },
      { status: 503 },
    );
  }
  return NextResponse.json({
    embedded: true,
    orderId: result.orderId,
    paid: "paid" in result ? true : undefined,
    requiresAction: "requiresAction" in result ? true : undefined,
    processing: "processing" in result ? true : undefined,
    clientSecret: "requiresAction" in result ? result.clientSecret : undefined,
    paymentIntentId: "requiresAction" in result ? result.paymentIntentId : undefined,
    publishableKey: publishableKey ?? undefined,
  });
}

export async function postMarketplaceCheckout(req: Request): Promise<Response> {
  const auth = await resolveListingsUserId(req);
  if (auth instanceof NextResponse) return auth;

  try {
    await Promise.all([
      ensureMarketplacePlatformFeeCache(true),
      ensureLiveShowFeeCache(true),
      ensurePayoutProgramCache(),
    ]);
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
      const selectedShippingRateId =
        trim(body.selectedShippingRateId ?? sh.selectedShippingRateId, 200) || null;
      const paymentMethodId =
        typeof body.paymentMethodId === "string" && body.paymentMethodId.trim().length > 0
          ? body.paymentMethodId.trim()
          : null;
      const checkoutArgs = {
        buyerId,
        listingId,
        liveRoomItemId,
        shipping: { ...resolvedShipping, buyerAddressId, selectedShippingRateId },
        successPath: body.successPath,
        cancelPath: body.cancelPath,
        applyReferralCredit: body.applyReferralCredit === true,
      };
      if (body.embedded === true) {
        const embeddedResult = await createBuyNowCheckoutSession({
          ...checkoutArgs,
          embedded: true,
          paymentMethodId,
        });
        return jsonEmbeddedBuyNowResult(embeddedResult);
      }
      const { url } = await createBuyNowCheckoutSession(checkoutArgs);
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
      const selectedShippingRateId =
        trim(body.selectedShippingRateId ?? sh.selectedShippingRateId, 200) || null;
      const { url, layawayId } = await createLayawayDepositCheckout({
        buyerId,
        listingId,
        planType: planRaw as LayawayPlanType,
        termsAcknowledged: true,
        shipping: { ...resolvedShipping, buyerAddressId, selectedShippingRateId },
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
        applyReferralCredit: body.applyReferralCredit === true,
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
    if (e instanceof CommerceGuardError) {
      const hit = commerceGuardErrorToHttp(e.code);
      return NextResponse.json({ error: hit.error, code: e.code }, { status: hit.status });
    }
    const msg = e instanceof Error ? e.message : "";
    const map: Record<string, { status: number; msg: string; code?: string }> = {
      NOT_BUY_NOW: { status: 400, msg: "This listing is not buy now." },
      NOT_AVAILABLE: { status: 409, msg: "This listing is not available.", code: "ITEM_NOT_AVAILABLE" },
      OWN_LISTING: { status: 400, msg: "You cannot buy your own listing." },
      SELLER_NOT_READY: { status: 409, msg: "Seller has not finished Stripe Connect onboarding." },
      LIVE_ITEM_INVALID: { status: 400, msg: "That live item is not available for checkout." },
      ALREADY_SOLD: { status: 409, msg: "This item is already sold.", code: "ITEM_NOT_AVAILABLE" },
      CHECKOUT_IN_PROGRESS: { status: 409, msg: "Checkout already in progress for this listing." },
      LISTING_LAYAWAY_LOCKED: {
        status: 409,
        msg: "This item is reserved on layaway and cannot be purchased.",
        code: "ITEM_RESERVED_ON_LAYAWAY",
      },
      USE_LAYAWAY_PAYOFF: {
        status: 409,
        msg: "You have an active layaway on this item. Pay your remaining balance instead of Buy Now.",
        code: "USE_LAYAWAY_PAYOFF",
      },
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
      SHIPPING_RATE_REQUIRED: { status: 400, msg: "Select a shipping option to continue." },
      SHIPPING_RATE_INVALID: { status: 409, msg: "That shipping option is no longer available. Pick another rate." },
      LISTING_NOT_FOUND: { status: 404, msg: "Listing not found." },
      SELLER_SHIP_FROM_INCOMPLETE: {
        status: 422,
        msg: "Seller ship-from address is not set up yet. Contact the seller before checkout.",
      },
      SHIPPO_SHIPMENT_FAILED: { status: 502, msg: "Shipping rates could not be confirmed. Try again or pick another rate." },
      NO_CHECKOUT_URL: { status: 502, msg: "Checkout could not be created. Try again shortly." },
      NO_SAVED_CARD: {
        status: 400,
        msg: "Add a payment method in Vault Wallet before checkout.",
      },
      ORDER_NOT_ELIGIBLE_SAVED_CARD: { status: 400, msg: "This order cannot be paid with your saved card." },
      CARD_DECLINED: { status: 402, msg: "Card was declined. Update your payment method in Vault Wallet and try again." },
      BUYER_STRIPE_CUSTOMER_MISSING: {
        status: 400,
        msg: "Missing Stripe customer on your account. Add a card in Vault Wallet first.",
      },
      PAYMENT_INTENT_NOT_COMPLETED: { status: 409, msg: "Payment did not complete. Try again." },
      STRIPE_ERROR: { status: 502, msg: "Payment processor error. Try again shortly." },
      STRIPE_NOT_CONFIGURED: { status: 503, msg: "Payments are not configured on this site yet." },
      USER_NOT_FOUND: { status: 404, msg: "Account not found." },
      LISTING_UNAVAILABLE: { status: 409, msg: "This listing is not available for layaway.", code: "ITEM_NOT_AVAILABLE" },
    };
    const hit = map[msg];
    if (hit) {
      return NextResponse.json(
        { error: hit.msg, ...(hit.code ? { code: hit.code } : {}) },
        { status: hit.status },
      );
    }
    const stripeErr = stripeRouteErrorResponse("checkout", e);
    return NextResponse.json(stripeErr.body, { status: stripeErr.status });
  }
}
