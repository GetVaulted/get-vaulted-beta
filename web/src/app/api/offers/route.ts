import { NextResponse } from "next/server";
import { resolveListingsUserId } from "@/lib/resolve-listings-auth";
import { createNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

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

  const amountUsd = typeof body.amountUsd === "number" && Number.isFinite(body.amountUsd) ? body.amountUsd : NaN;
  if (!(amountUsd > 0)) {
    return NextResponse.json({ error: "Enter a valid offer amount." }, { status: 400 });
  }

  const buyerId = auth.userId;
  const message = trimMessage(body.message);

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      title: true,
      sellerId: true,
      status: true,
      allowOffers: true,
      minimumOfferUsd: true,
      buyingFormat: true,
      moderationRemovedAt: true,
    },
  });

  if (!listing) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }
  if (listing.moderationRemovedAt) {
    return NextResponse.json({ error: "This listing is not available." }, { status: 410 });
  }
  if (listing.sellerId === buyerId) {
    return NextResponse.json({ error: "You cannot offer on your own listing." }, { status: 400 });
  }
  if (!listing.allowOffers) {
    return NextResponse.json({ error: "This listing does not accept offers." }, { status: 400 });
  }
  if (listing.status === "layaway_reserved") {
    return NextResponse.json({ error: "This listing is on layaway and not accepting offers." }, { status: 409 });
  }
  if (listing.status !== "active" && listing.status !== "auction_live") {
    return NextResponse.json({ error: "This listing is not accepting offers." }, { status: 409 });
  }

  const min = listing.minimumOfferUsd;
  if (min != null && Number.isFinite(min) && amountUsd < min) {
    return NextResponse.json(
      {
        error: `Offers must be at least ${min.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}.`,
      },
      { status: 400 },
    );
  }

  const existingOrder = await prisma.order.findUnique({ where: { listingId }, select: { id: true } });
  if (existingOrder) {
    return NextResponse.json({ error: "This item is no longer available for offers." }, { status: 409 });
  }

  const openFromBuyer = await prisma.offer.findFirst({
    where: {
      listingId,
      buyerId,
      status: { in: ["pending", "countered"] },
    },
    select: { id: true },
  });
  if (openFromBuyer) {
    return NextResponse.json(
      { error: "You already have an open offer on this listing. Check your account offers." },
      { status: 409 },
    );
  }

  try {
    const offer = await prisma.offer.create({
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
    const lt = listing.title.length > 90 ? `${listing.title.slice(0, 87)}…` : listing.title;
    const amt = amountUsd.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
    await createNotification(prisma, {
      userId: listing.sellerId,
      type: "offer_received",
      title: "New offer",
      body: `You received an offer of ${amt} on “${lt}”.`,
      href: "/account/offers",
    });
    return NextResponse.json({ offer });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Could not save your offer." }, { status: 500 });
  }
}
