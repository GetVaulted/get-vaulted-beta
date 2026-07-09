import { NextResponse } from "next/server";
import { formatMarketplaceUsd } from "@/lib/format-marketplace-usd";
import { formatShippingRateRangeDisplay } from "@/lib/marketplace-shipping-display";
import { resolveOptionalListingsUserId } from "@/lib/resolve-listings-auth";
import { prisma } from "@/lib/prisma";
import { fetchMarketplaceCheckoutShippingRates } from "@/services/marketplace-checkout-shipping";

export const runtime = "nodejs";

/** Shippo shipping estimate preview for item detail (buyer's default address when signed in). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listingId = decodeURIComponent(id);

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { shippingPriceUsd: true, status: true, moderationRemovedAt: true },
  });

  if (!listing || listing.moderationRemovedAt) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }

  if (listing.shippingPriceUsd > 0) {
    const display = formatMarketplaceUsd(listing.shippingPriceUsd);
    return NextResponse.json({
      flatRateUsd: listing.shippingPriceUsd,
      display,
      rates: [],
    });
  }

  const userId = await resolveOptionalListingsUserId(req);
  if (!userId) {
    return NextResponse.json({ needsSignIn: true, display: null, rates: [] });
  }

  const addr = await prisma.address.findFirst({
    where: { userId, type: "shipping" },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });

  if (!addr) {
    return NextResponse.json({ needsAddress: true, display: null, rates: [] });
  }

  try {
    const { rates, shipFromLabel } = await fetchMarketplaceCheckoutShippingRates({
      listingId,
      shipTo: {
        shipRecipientName: addr.fullName,
        shipAddress: addr.line1,
        shipAddressLine2: addr.line2?.trim() || undefined,
        shipCity: addr.city,
        shipState: addr.state,
        shipZip: addr.postalCode,
        shipCountry: addr.country,
      },
    });

    const display = formatShippingRateRangeDisplay(rates);
    return NextResponse.json({
      display,
      shipFromLabel,
      rates: rates.map((rate) => ({
        id: rate.id,
        carrier: rate.carrier,
        serviceLevel: rate.serviceLevel,
        amount: rate.amount,
        currency: rate.currency,
        estimatedDelivery: rate.estimatedDelivery,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "LISTING_NOT_FOUND") {
      return NextResponse.json({ error: "Listing not found." }, { status: 404 });
    }
    if (msg === "SELLER_SHIP_FROM_INCOMPLETE") {
      return NextResponse.json(
        { error: "Seller ship-from address is not set up yet.", display: null, rates: [] },
        { status: 422 },
      );
    }
    console.error("[listings/shipping-estimate]", e);
    return NextResponse.json({ error: "Shipping estimate unavailable.", display: null, rates: [] }, { status: 502 });
  }
}
