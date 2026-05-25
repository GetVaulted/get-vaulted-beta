import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { estimateSalesTaxCents, isStripeTaxFeatureEnabled } from "@/lib/stripe-tax";

export const runtime = "nodejs";

type Body = {
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
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
  const shipTo = {
    shipRecipientName: trim(sh.shipRecipientName, 200),
    shipAddress: trim(sh.shipAddress, 500),
    shipCity: trim(sh.shipCity, 120),
    shipState: trim(sh.shipState, 120),
    shipZip: trim(sh.shipZip, 32),
    shipCountry: trim(sh.shipCountry, 120) || "US",
  };

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

  try {
    const est = await estimateSalesTaxCents({
      itemPriceUsd,
      shippingPriceUsd,
      shipTo,
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
    return NextResponse.json(
      { error: "Tax estimate unavailable. Tax will be calculated at checkout." },
      { status: 502 },
    );
  }
}
