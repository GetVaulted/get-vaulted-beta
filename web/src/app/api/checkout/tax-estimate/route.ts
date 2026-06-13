import { NextResponse } from "next/server";
import { resolveListingsUserId } from "@/lib/resolve-listings-auth";
import { prisma } from "@/lib/prisma";
import {
  estimateSalesTaxCents,
  isStripeTaxFeatureEnabled,
  isMarketplaceSaleTaxEligible,
  loadSellerShipFromForTax,
  normalizeShipToAddress,
} from "@/lib/stripe-tax";

export const runtime = "nodejs";

type Body = {
  listingId?: string;
  itemPriceUsd?: number;
  shippingPriceUsd?: number;
  shipping?: {
    shipRecipientName?: string;
    shipAddress?: string;
    shipCity?: string;
    shipState?: string;
    shipZip?: string;
    shipCountry?: string;
  };
};

function trim(s: unknown, max = 500): string {
  return typeof s === "string" ? s.trim().slice(0, max) : "";
}

/** Estimate buyer sales tax for checkout UI (Stripe Tax Calculation API). */
export async function POST(req: Request) {
  const auth = await resolveListingsUserId(req);
  if (auth instanceof NextResponse) return auth;

  if (!isStripeTaxFeatureEnabled()) {
    return NextResponse.json({
      collectTax: false,
      taxAmountCents: 0,
      taxUsd: 0,
      taxCalculationId: null,
    });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const itemPriceUsd = Number(body.itemPriceUsd);
  const shippingPriceUsd = Number(body.shippingPriceUsd ?? 0);
  const sh = body.shipping ?? {};
  const shipTo = normalizeShipToAddress({
    shipRecipientName: trim(sh.shipRecipientName, 200),
    shipAddress: trim(sh.shipAddress, 500),
    shipCity: trim(sh.shipCity, 120),
    shipState: trim(sh.shipState, 120),
    shipZip: trim(sh.shipZip, 32),
    shipCountry: trim(sh.shipCountry, 120) || "US",
  });

  if (!Number.isFinite(itemPriceUsd) || itemPriceUsd < 0) {
    return NextResponse.json({ error: "itemPriceUsd required." }, { status: 400 });
  }
  if (!shipTo.shipAddress || !shipTo.shipCity || !shipTo.shipState || !shipTo.shipZip) {
    return NextResponse.json({
      collectTax: false,
      taxAmountCents: 0,
      taxUsd: 0,
      taxCalculationId: null,
      note: "Complete shipping address to estimate tax.",
    });
  }

  const listingId = trim(body.listingId, 120);
  let sellerShipFrom = null;
  if (listingId) {
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { sellerId: true },
    });
    if (listing) {
      sellerShipFrom = await loadSellerShipFromForTax(listing.sellerId);
    }
  }

  try {
    const est = await estimateSalesTaxCents({
      itemPriceUsd,
      shippingPriceUsd,
      shipTo,
      sellerShipFrom,
    });
    return NextResponse.json({
      collectTax: est.collectTax,
      taxAmountCents: est.taxAmountCents,
      taxUsd: est.taxAmountCents / 100,
      taxCalculationId: est.taxCalculationId,
      subtotalUsd: itemPriceUsd + shippingPriceUsd,
      totalUsd: itemPriceUsd + shippingPriceUsd + est.taxAmountCents / 100,
    });
  } catch (e) {
    console.error("[checkout/tax-estimate]", e);
    const collectTax = await isMarketplaceSaleTaxEligible({ shipTo, sellerShipFrom });
    if (collectTax) {
      return NextResponse.json({
        collectTax: true,
        taxAmountCents: 0,
        taxUsd: 0,
        taxCalculationId: null,
        subtotalUsd: itemPriceUsd + shippingPriceUsd,
        totalUsd: itemPriceUsd + shippingPriceUsd,
        note: "Sales tax is calculated securely at checkout when required.",
      });
    }
    return NextResponse.json(
      { error: "Tax estimate unavailable." },
      { status: 502 },
    );
  }
}
