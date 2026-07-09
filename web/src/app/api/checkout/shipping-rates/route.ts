import { NextResponse } from "next/server";
import { resolveListingsUserId } from "@/lib/resolve-listings-auth";
import { prisma } from "@/lib/prisma";
import { fetchMarketplaceCheckoutShippingRates } from "@/services/marketplace-checkout-shipping";

export const runtime = "nodejs";

type Body = {
  listingId?: string;
  buyerAddressId?: string;
  shipping?: {
    shipRecipientName?: string;
    shipAddress?: string;
    shipAddressLine2?: string;
    shipCity?: string;
    shipState?: string;
    shipZip?: string;
    shipCountry?: string;
  };
};

function trim(s: unknown, max = 500): string {
  return typeof s === "string" ? s.trim().slice(0, max) : "";
}

/** Live Shippo quotes for marketplace checkout (filtered by seller offer rules). */
export async function POST(req: Request) {
  const auth = await resolveListingsUserId(req);
  if (auth instanceof NextResponse) return auth;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const listingId = trim(body.listingId, 120);
  if (!listingId) return NextResponse.json({ error: "listingId required." }, { status: 400 });

  const buyerAddressId =
    typeof body.buyerAddressId === "string" && body.buyerAddressId.trim().length > 0
      ? body.buyerAddressId.trim()
      : null;

  const sh = body.shipping ?? {};
  let shipTo = {
    shipRecipientName: trim(sh.shipRecipientName, 200),
    shipAddress: trim(sh.shipAddress, 500),
    shipAddressLine2: trim(sh.shipAddressLine2, 500) || undefined,
    shipCity: trim(sh.shipCity, 120),
    shipState: trim(sh.shipState, 120),
    shipZip: trim(sh.shipZip, 32),
    shipCountry: trim(sh.shipCountry, 120) || "US",
  };

  if (buyerAddressId) {
    const addr = await prisma.address.findFirst({
      where: { id: buyerAddressId, userId: auth.userId, type: "shipping" },
    });
    if (!addr) return NextResponse.json({ error: "Select a valid shipping address." }, { status: 400 });
    shipTo = {
      shipRecipientName: addr.fullName || shipTo.shipRecipientName,
      shipAddress: addr.line1,
      shipAddressLine2: addr.line2?.trim() || undefined,
      shipCity: addr.city,
      shipState: addr.state,
      shipZip: addr.postalCode,
      shipCountry: addr.country,
    };
  }

  if (!shipTo.shipRecipientName || !shipTo.shipAddress || !shipTo.shipCity || !shipTo.shipState || !shipTo.shipZip) {
    return NextResponse.json({ error: "Complete shipping address to load rates." }, { status: 400 });
  }

  try {
    const { rates, mock, shipFromLabel } = await fetchMarketplaceCheckoutShippingRates({ listingId, shipTo });
    return NextResponse.json({ rates, mock, shipFromLabel });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "LISTING_NOT_FOUND") {
      return NextResponse.json({ error: "Listing not found." }, { status: 404 });
    }
    if (msg === "LISTING_PARCEL_INCOMPLETE") {
      return NextResponse.json(
        { error: "This listing is missing package details for shipping quotes.", rates: [] },
        { status: 422 },
      );
    }
    if (msg === "SELLER_SHIP_FROM_INCOMPLETE") {
      return NextResponse.json(
        { error: "Seller ship-from address is not set up yet.", rates: [] },
        { status: 422 },
      );
    }
    console.error("[checkout/shipping-rates]", e);
    return NextResponse.json({ error: "Shipping rates unavailable. Try again shortly.", rates: [] }, { status: 502 });
  }
}
