import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { createOrderFromAcceptedOffer, declineOtherOpenOffersOnListing, loadBuyerShipToForOffer } from "@/lib/offer-fulfillment";
import { createNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

type PatchBody = {
  action?: string;
  counterAmountUsd?: unknown;
};

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: raw } = await ctx.params;
  const offerId = decodeURIComponent(raw);

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action.trim() : "";

  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: {
      listing: {
        select: {
          id: true,
          title: true,
          sellerId: true,
          status: true,
          shippingPriceUsd: true,
          moderationRemovedAt: true,
        },
      },
    },
  });

  if (!offer) {
    return NextResponse.json({ error: "Offer not found." }, { status: 404 });
  }

  const listing = offer.listing;
  const uid = session.user.id;

  try {
    if (action === "accept" && uid === offer.sellerId) {
      if (offer.status !== "pending") {
        return NextResponse.json({ error: "Only pending offers can be accepted." }, { status: 400 });
      }
      if (listing.moderationRemovedAt) {
        return NextResponse.json({ error: "Listing is not available." }, { status: 410 });
      }
      if (listing.status !== "active" && listing.status !== "auction_live") {
        return NextResponse.json({ error: "Listing is not available." }, { status: 409 });
      }
      const existingOrder = await prisma.order.findUnique({ where: { listingId: listing.id }, select: { id: true } });
      if (existingOrder) {
        return NextResponse.json({ error: "Listing already sold." }, { status: 409 });
      }

      const shipTo = await loadBuyerShipToForOffer(offer.buyerId);
      const defaultAddr = shipTo
        ? await prisma.address.findFirst({
            where: { userId: offer.buyerId, isDefault: true },
            select: { id: true },
          })
        : null;

      const { orderId } = await prisma.$transaction(async (tx) => {
        // Compare-and-swap: the pre-transaction `offer.status !== "pending"` check above is a
        // cheap early exit, not a safety guarantee — two concurrent PATCH requests (double-click,
        // or a seller accepting two different offers on the same listing) can both read "pending"
        // before either commits. Claiming the row here with a `status: "pending"` WHERE clause
        // means only one concurrent transaction can ever win; the loser's `count === 0` throws and
        // rolls back its own transaction instead of silently clobbering the winner's outcome.
        const claim = await tx.offer.updateMany({
          where: { id: offerId, status: "pending" },
          data: { status: "accepted", counterAmountUsd: null },
        });
        if (claim.count === 0) throw new Error("OFFER_STATE_CHANGED");
        const r = await createOrderFromAcceptedOffer(tx, {
          listingId: listing.id,
          listingTitle: listing.title,
          buyerId: offer.buyerId,
          sellerId: offer.sellerId,
          itemPriceUsd: offer.amountUsd,
          shippingPriceUsd: listing.shippingPriceUsd,
          shipTo,
          buyerAddressId: defaultAddr?.id ?? null,
        });
        await declineOtherOpenOffersOnListing(tx, listing.id, offerId);
        return r;
      });

      return NextResponse.json({ ok: true, orderCreated: true, orderId });
    }

    if (action === "decline" && uid === offer.sellerId) {
      if (offer.status !== "pending") {
        return NextResponse.json({ error: "Only pending offers can be declined." }, { status: 400 });
      }
      const claim = await prisma.offer.updateMany({
        where: { id: offerId, status: "pending" },
        data: { status: "declined", counterAmountUsd: null },
      });
      if (claim.count === 0) {
        return NextResponse.json({ error: "This offer was already resolved." }, { status: 409 });
      }
      const lt =
        listing.title.length > 90 ? `${listing.title.slice(0, 87)}…` : listing.title;
      await createNotification(prisma, {
        userId: offer.buyerId,
        type: "offer_declined",
        title: "Offer declined",
        body: `Your offer on “${lt}” was declined.`,
        href: "/account/offers",
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "counter" && uid === offer.sellerId) {
      if (offer.status !== "pending") {
        return NextResponse.json({ error: "You can only counter a pending offer." }, { status: 400 });
      }
      const c =
        typeof body.counterAmountUsd === "number" && Number.isFinite(body.counterAmountUsd) ? body.counterAmountUsd : NaN;
      if (!(c > 0)) {
        return NextResponse.json({ error: "Enter a valid counter amount." }, { status: 400 });
      }
      const claim = await prisma.offer.updateMany({
        where: { id: offerId, status: "pending" },
        data: { status: "countered", counterAmountUsd: c },
      });
      if (claim.count === 0) {
        return NextResponse.json({ error: "This offer was already resolved." }, { status: 409 });
      }
      const lt =
        listing.title.length > 90 ? `${listing.title.slice(0, 87)}…` : listing.title;
      const fmt = c.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
      await createNotification(prisma, {
        userId: offer.buyerId,
        type: "counteroffer_received",
        title: "Counteroffer received",
        body: `The seller countered on “${lt}” at ${fmt}.`,
        href: "/account/offers",
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "accept_counter" && uid === offer.buyerId) {
      if (offer.status !== "countered" || offer.counterAmountUsd == null || !(offer.counterAmountUsd > 0)) {
        return NextResponse.json({ error: "No counter to accept." }, { status: 400 });
      }
      if (listing.moderationRemovedAt) {
        return NextResponse.json({ error: "Listing is not available." }, { status: 410 });
      }
      if (listing.status !== "active" && listing.status !== "auction_live") {
        return NextResponse.json({ error: "Listing is not available." }, { status: 409 });
      }
      const existingOrder = await prisma.order.findUnique({ where: { listingId: listing.id }, select: { id: true } });
      if (existingOrder) {
        return NextResponse.json({ error: "Listing already sold." }, { status: 409 });
      }

      const price = offer.counterAmountUsd;

      const shipTo = await loadBuyerShipToForOffer(offer.buyerId);
      const defaultAddr = shipTo
        ? await prisma.address.findFirst({
            where: { userId: offer.buyerId, isDefault: true },
            select: { id: true },
          })
        : null;

      const { orderId } = await prisma.$transaction(async (tx) => {
        // Compare-and-swap for the same reason as the plain "accept" branch above.
        const claim = await tx.offer.updateMany({
          where: { id: offerId, status: "countered" },
          data: { status: "accepted" },
        });
        if (claim.count === 0) throw new Error("OFFER_STATE_CHANGED");
        const r = await createOrderFromAcceptedOffer(tx, {
          listingId: listing.id,
          listingTitle: listing.title,
          buyerId: offer.buyerId,
          sellerId: offer.sellerId,
          itemPriceUsd: price,
          shippingPriceUsd: listing.shippingPriceUsd,
          shipTo,
          buyerAddressId: defaultAddr?.id ?? null,
        });
        await declineOtherOpenOffersOnListing(tx, listing.id, offerId);
        return r;
      });

      return NextResponse.json({ ok: true, orderCreated: true, orderId });
    }

    if (action === "decline_counter" && uid === offer.buyerId) {
      if (offer.status !== "countered") {
        return NextResponse.json({ error: "Nothing to decline." }, { status: 400 });
      }
      const claim = await prisma.offer.updateMany({
        where: { id: offerId, status: "countered" },
        data: { status: "declined", counterAmountUsd: null },
      });
      if (claim.count === 0) {
        return NextResponse.json({ error: "This offer was already resolved." }, { status: 409 });
      }
      const lt =
        listing.title.length > 90 ? `${listing.title.slice(0, 87)}…` : listing.title;
      await createNotification(prisma, {
        userId: offer.sellerId,
        type: "offer_declined",
        title: "Counteroffer declined",
        body: `The buyer declined your counter on “${lt}”.`,
        // Sellers manage offers in the listing studio, not the buyer-facing "/account/offers" page —
        // link straight to the listing with the offer id so the studio can auto-open and highlight it.
        href: `/seller/listings/${encodeURIComponent(listing.id)}?offerId=${encodeURIComponent(offerId)}`,
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (e) {
    if (e instanceof Error && e.message === "OFFER_STATE_CHANGED") {
      return NextResponse.json({ error: "This offer was already resolved." }, { status: 409 });
    }
    if (e instanceof Error && e.message === "LISTING_ALREADY_SOLD_OTHER_BUYER") {
      return NextResponse.json({ error: "This listing was just sold to another buyer." }, { status: 409 });
    }
    if (e instanceof Error && e.message === "LISTING_INVENTORY_HELD") {
      return NextResponse.json(
        { error: "Another buyer is checking out or has reserved this listing. Try again shortly." },
        { status: 409 },
      );
    }
    if (e instanceof Error && e.message === "LISTING_UNAVAILABLE") {
      return NextResponse.json({ error: "Listing was just sold or is unavailable." }, { status: 409 });
    }
    if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "Listing already has an order." }, { status: 409 });
    }
    console.error(e);
    return NextResponse.json({ error: "Could not update offer." }, { status: 500 });
  }
}
