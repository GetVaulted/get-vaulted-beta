import { NextResponse } from "next/server";
import { resolveListingsUserId } from "@/lib/resolve-listings-auth";
import { createNotification } from "@/lib/notifications";
import { formatMarketplaceUsd } from "@/lib/format-marketplace-usd";
import {
  assertMakeOfferAllowed,
  CommerceGuardError,
  commerceGuardErrorToHttp,
  loadListingCommerceContext,
} from "@/lib/marketplace/commerce-guards";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

const DUPLICATE_OPEN_OFFER_ERROR = "You already have an open offer on this listing. Check your account offers.";

class DuplicateOpenOfferError extends Error {}

function isSerializationConflict(e: unknown): boolean {
  // P2034: "Transaction failed due to a write conflict or a deadlock" — Postgres aborting one
  // side of a Serializable-isolation race (same signal `order-refund-request.ts` treats as proof
  // two writers collided, not proof of an actual duplicate — but here the only concurrent writer
  // possible for this same buyer+listing pair *is* another make-offer call, so it's safe to map
  // straight to the duplicate-offer message rather than a generic retry).
  return Boolean(e && typeof e === "object" && "code" in e && (e as { code: unknown }).code === "P2034");
}

type Body = {
  listingId?: string;
  amountUsd?: unknown;
  message?: unknown;
};

function trimMessage(s: unknown, max = 2000): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim().slice(0, max);
  return t.length ? t : null;
}

export async function POST(req: Request) {
  const auth = await resolveListingsUserId(req);
  if (auth instanceof NextResponse) {
    return NextResponse.json({ error: "Sign in to make an offer." }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const listingId = typeof body.listingId === "string" ? body.listingId.trim() : "";
  if (!listingId) {
    return NextResponse.json({ error: "Missing listing." }, { status: 400 });
  }

  const rawAmountUsd = typeof body.amountUsd === "number" && Number.isFinite(body.amountUsd) ? body.amountUsd : NaN;
  if (!(rawAmountUsd > 0)) {
    return NextResponse.json({ error: "Enter a valid offer amount." }, { status: 400 });
  }
  // Normalize to 2 decimal places server-side as the source of truth — the client mirrors this
  // for UX, but the API must never persist e.g. "200.999999999999999999" verbatim.
  const amountUsd = Math.round(rawAmountUsd * 100) / 100;

  const buyerId = auth.userId;
  const message = trimMessage(body.message);

  const commerceCtx = await loadListingCommerceContext(prisma, listingId);
  if (!commerceCtx) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }

  try {
    assertMakeOfferAllowed(commerceCtx, buyerId);
  } catch (e) {
    if (e instanceof CommerceGuardError) {
      const hit = commerceGuardErrorToHttp(e.code);
      return NextResponse.json({ error: hit.error, code: e.code }, { status: hit.status });
    }
    throw e;
  }

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      title: true,
      sellerId: true,
      minimumOfferUsd: true,
    },
  });

  if (!listing) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }

  const min = listing.minimumOfferUsd;
  if (min != null && Number.isFinite(min) && amountUsd < min) {
    return NextResponse.json(
      {
        error: `Offers must be at least ${formatMarketplaceUsd(min)}.`,
      },
      { status: 400 },
    );
  }

  const existingOrder = await prisma.order.findUnique({ where: { listingId }, select: { id: true } });
  if (existingOrder) {
    return NextResponse.json(
      { error: "This item is no longer available for offers.", code: "ITEM_NOT_AVAILABLE" },
      { status: 409 },
    );
  }

  // The read-check-then-create for "does this buyer already have an open offer on this listing"
  // must happen inside a single Serializable-isolation transaction — two concurrent make-offer
  // requests (e.g. a double-tap, or two tabs) could otherwise both pass the plain findFirst check
  // before either commit its create, landing two open offers for the same buyer+listing pair.
  // Serializable isolation makes Postgres itself detect that collision and abort one side (mirrors
  // the same guard already used for `OrderRefundRequest` in order-refund-request.ts); the P2034
  // catch below turns that abort into the same 409 a non-concurrent duplicate already gets.
  let offer: { id: string; status: string; amountUsd: number; createdAt: Date };
  try {
    offer = await prisma.$transaction(
      async (tx) => {
        const openFromBuyer = await tx.offer.findFirst({
          where: {
            listingId,
            buyerId,
            status: { in: ["pending", "countered"] },
          },
          select: { id: true },
        });
        if (openFromBuyer) {
          throw new DuplicateOpenOfferError();
        }
        return tx.offer.create({
          data: {
            listingId,
            sellerId: listing.sellerId,
            buyerId,
            amountUsd,
            message,
            status: "pending",
          },
          select: {
            id: true,
            status: true,
            amountUsd: true,
            createdAt: true,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (e) {
    if (e instanceof DuplicateOpenOfferError) {
      return NextResponse.json({ error: DUPLICATE_OPEN_OFFER_ERROR }, { status: 409 });
    }
    if (isSerializationConflict(e)) {
      return NextResponse.json({ error: DUPLICATE_OPEN_OFFER_ERROR }, { status: 409 });
    }
    console.error(e);
    return NextResponse.json({ error: "Could not save your offer." }, { status: 500 });
  }

  const lt = listing.title.length > 90 ? `${listing.title.slice(0, 87)}…` : listing.title;
  const amt = formatMarketplaceUsd(amountUsd);
  await createNotification(prisma, {
    userId: listing.sellerId,
    type: "offer_received",
    title: "New offer",
    body: `You received an offer of ${amt} on “${lt}”.`,
    // Sellers manage received offers in the listing studio, not the buyer-facing "/account/offers"
    // page — link straight to the listing with the offer id so the studio can auto-open and
    // highlight it, instead of dropping the seller on a page that can't even show this offer.
    href: `/seller/listings/${encodeURIComponent(listing.id)}?offerId=${encodeURIComponent(offer.id)}`,
  });
  return NextResponse.json({ offer });
}
