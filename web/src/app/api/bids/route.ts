import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { placeListingProxyBid, type AuctionBidCheckoutSnapshot } from "@/lib/place-listing-bid";
import { createNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { emitListingBidPlaced } from "@/lib/realtime-emit-server";
import { assertPaymentMethodOwnedByUser } from "@/lib/stripe-customer";
import { isStripePaymentMethodId } from "@/lib/stripe-payment-method-id";
import { isStripeConfigured } from "@/lib/stripe";
import {
  isLegacyMarketplaceTimedAuction,
  MARKETPLACE_AUCTION_DISABLED_MESSAGE,
} from "@/lib/marketplace-commerce-policy";

type CheckoutJson = {
  shipRecipientName?: unknown;
  shipAddress?: unknown;
  shipCity?: unknown;
  shipState?: unknown;
  shipZip?: unknown;
  shipCountry?: unknown;
  /** Stripe PaymentMethod id (`pm_…`). */
  paymentMethodId?: unknown;
  buyerAddressId?: unknown;
};

type Body = {
  listingId?: string;
  amountUsd?: unknown;
  maxBidUsd?: unknown;
  liveRoomItemId?: string;
  checkout?: unknown;
};

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function trimField(s: unknown, max: number): string {
  if (typeof s !== "string") return "";
  return s.trim().slice(0, max);
}

function parseAuctionCheckout(body: Body, require: boolean): AuctionBidCheckoutSnapshot | undefined {
  if (!require) return undefined;
  const raw = body.checkout;
  if (!raw || typeof raw !== "object") {
    throw new Error("CHECKOUT_REQUIRED");
  }
  const c = raw as CheckoutJson;
  const shipRecipientName = trimField(c.shipRecipientName, 200);
  const shipAddress = trimField(c.shipAddress, 500);
  const shipCity = trimField(c.shipCity, 120);
  const shipState = trimField(c.shipState, 120);
  const shipZip = trimField(c.shipZip, 32);
  const shipCountry = trimField(c.shipCountry, 120);
  const paymentMethodId = trimField(c.paymentMethodId, 99);
  const buyerAddressId = trimField(c.buyerAddressId, 120);
  if (!shipRecipientName || !shipAddress || !shipCity || !shipState || !shipZip || !shipCountry) {
    throw new Error("CHECKOUT_SHIP_INCOMPLETE");
  }
  if (!paymentMethodId) {
    throw new Error("CHECKOUT_PAYMENT_REQUIRED");
  }
  if (!isStripePaymentMethodId(paymentMethodId)) {
    throw new Error("CHECKOUT_PAYMENT_INVALID");
  }
  return {
    shipRecipientName,
    shipAddress,
    shipCity,
    shipState,
    shipZip,
    shipCountry,
    paymentLabel: paymentMethodId,
    buyerAddressId: buyerAddressId || null,
  };
}

export async function POST(req: Request) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to place a bid." }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const listingId = typeof body.listingId === "string" ? body.listingId.trim() : "";
  const maxFromBody =
    typeof body.maxBidUsd === "number" && Number.isFinite(body.maxBidUsd)
      ? body.maxBidUsd
      : typeof body.amountUsd === "number" && Number.isFinite(body.amountUsd)
        ? body.amountUsd
        : NaN;
  const liveRoomItemId = typeof body.liveRoomItemId === "string" ? body.liveRoomItemId.trim() : "";

  if (liveRoomItemId) {
    return NextResponse.json(
      {
        error: "Live auction bids must use POST /api/live-rooms/{roomId}/items/{itemId}/bid.",
        code: "USE_LIVE_BID_ROUTE",
      },
      { status: 400 },
    );
  }

  if (!listingId) return NextResponse.json({ error: "Missing listing." }, { status: 400 });
  if (!(maxFromBody > 0)) return NextResponse.json({ error: "Enter a valid bid amount." }, { status: 400 });

  if (!liveRoomItemId) {
    const listingRow = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { buyingFormat: true, status: true },
    });
    if (!listingRow) return NextResponse.json({ error: "Listing not found." }, { status: 404 });
    if (isLegacyMarketplaceTimedAuction(listingRow)) {
      return NextResponse.json(
        { error: MARKETPLACE_AUCTION_DISABLED_MESSAGE, code: "MARKETPLACE_AUCTION_DISABLED" },
        { status: 400 },
      );
    }
  }

  const bidderId = session.user.id;

  if (!liveRoomItemId && !isStripeConfigured()) {
    return NextResponse.json(
      { error: "Stripe is not configured on this server. Bidding with a saved card is unavailable." },
      { status: 503 },
    );
  }

  let checkout: AuctionBidCheckoutSnapshot | undefined;
  try {
    checkout = parseAuctionCheckout(body, !liveRoomItemId);
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    if (code === "CHECKOUT_REQUIRED") {
      return NextResponse.json(
        { error: "Confirm your shipping address and payment method before bidding." },
        { status: 400 },
      );
    }
    if (code === "CHECKOUT_SHIP_INCOMPLETE") {
      return NextResponse.json({ error: "Complete all shipping fields." }, { status: 400 });
    }
    if (code === "CHECKOUT_PAYMENT_REQUIRED") {
      return NextResponse.json({ error: "Select a saved payment method." }, { status: 400 });
    }
    if (code === "CHECKOUT_PAYMENT_INVALID") {
      return NextResponse.json({ error: "Select a valid saved payment method." }, { status: 400 });
    }
  }

  if (checkout?.paymentLabel) {
    try {
      await assertPaymentMethodOwnedByUser(bidderId, checkout.paymentLabel);
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      if (code === "STRIPE_NOT_CONFIGURED") {
        return NextResponse.json(
          { error: "Stripe is not configured on this server. Payments are unavailable." },
          { status: 503 },
        );
      }
      if (code === "PM_NOT_OWNED" || code === "PM_NOT_FOUND") {
        return NextResponse.json(
          { error: "That payment method is not available on your account. Choose another card or add one in Wallet." },
          { status: 400 },
        );
      }
      console.error(e);
      return NextResponse.json({ error: "Could not verify payment method." }, { status: 500 });
    }
  }

  try {
    if (checkout?.buyerAddressId) {
      const addr = await prisma.address.findFirst({
        where: { id: checkout.buyerAddressId, userId: bidderId, type: "shipping" },
      });
      if (!addr) {
        return NextResponse.json({ error: "Select a valid shipping address." }, { status: 400 });
      }
      checkout = {
        ...checkout,
        shipRecipientName: addr.fullName || checkout.shipRecipientName,
        shipAddress: [addr.line1, addr.line2].filter(Boolean).join(" "),
        shipCity: addr.city,
        shipState: addr.state,
        shipZip: addr.postalCode,
        shipCountry: addr.country,
      };
    }
    const { result, liveRoomIdForRealtime } = await prisma.$transaction(async (tx) => {
      const r = await placeListingProxyBid(tx, { listingId, bidderId, maxBidUsd: maxFromBody, checkout });
      return { result: r, liveRoomIdForRealtime: null as string | null };
    });

    if (result.prevLeaderId && result.prevLeaderId !== bidderId) {
      const lt =
        result.listingTitle.length > 80 ? `${result.listingTitle.slice(0, 77)}…` : result.listingTitle;
      const high = result.amountUsd.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      });
      await createNotification(prisma, {
        userId: result.prevLeaderId,
        type: "auction_outbid",
        title: "You’ve been outbid",
        body: `Someone bid ${high} on “${lt}”.`,
        href: `/marketplace/${encodeURIComponent(listingId)}`,
      });
    }

    emitListingBidPlaced(listingId, liveRoomIdForRealtime);
    return NextResponse.json({
      ok: true,
      currentBidUsd: result.amountUsd,
      youAreLeader: result.youAreLeader,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "NOT_FOUND") return NextResponse.json({ error: "Listing not found." }, { status: 404 });
    if (msg === "NOT_AUCTION") return NextResponse.json({ error: "This listing is not an auction." }, { status: 400 });
    if (msg === "NOT_OPEN") return NextResponse.json({ error: "This auction is not open for bids." }, { status: 409 });
    if (msg === "OWN_LISTING") {
      return NextResponse.json({ error: "You cannot bid on your own listing." }, { status: 400 });
    }
    if (msg === "ENDED") return NextResponse.json({ error: "Auction has ended" }, { status: 409 });
    if (msg.startsWith("MIN_BID:")) {
      const min = Number(msg.slice("MIN_BID:".length));
      return NextResponse.json(
        { error: `Your max bid must be at least ${formatMoney(Number.isFinite(min) ? min : 0)}.` },
        { status: 400 },
      );
    }
    if (msg === "LISTING_UNAVAILABLE") {
      return NextResponse.json({ error: "This listing is no longer available." }, { status: 409 });
    }
    if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "Could not place bid." }, { status: 409 });
    }
    console.error(e);
    return NextResponse.json({ error: "Could not place bid." }, { status: 500 });
  }
}
