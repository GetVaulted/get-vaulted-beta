import { NextResponse } from "next/server";
import { isEscrowConfigured, orderTotalQualifiesForEscrow } from "@/lib/escrow-config";
import { prisma } from "@/lib/prisma";
import { isStripeConfigured } from "@/lib/stripe";

/**
 * Ensures Stripe (and optional high-value provider env when enabled) before starting checkout.
 * Returns a `NextResponse` when the request cannot proceed, otherwise `null`.
 */
export async function checkoutInfrastructureGate(
  kind: string,
  input: { listingId?: string; orderId?: string },
): Promise<NextResponse | null> {
  if (kind === "break_spot") {
    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: "Stripe is not configured. Add test keys to .env (see .env.example)." },
        { status: 503 },
      );
    }
    return null;
  }

  if (kind === "buy_now") {
    const listingId = input.listingId;
    if (!listingId) return null;
    const l = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { priceUsd: true, shippingPriceUsd: true },
    });
    const total = (l?.priceUsd ?? 0) + (l?.shippingPriceUsd ?? 0);
    if (orderTotalQualifiesForEscrow(total)) {
      if (!isEscrowConfigured()) {
        return NextResponse.json(
          {
            error:
              "High-value alternate checkout is not configured. Set ESCROW_ENABLED=true and provider env vars (see .env.example), or complete checkout with Stripe.",
          },
          { status: 503 },
        );
      }
      return null;
    }
    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: "Stripe is not configured. Add test keys to .env (see .env.example)." },
        { status: 503 },
      );
    }
    return null;
  }

  if (kind === "pay_order") {
    const orderId = input.orderId;
    if (!orderId) return null;
    const o = await prisma.order.findUnique({
      where: { id: orderId },
      select: { itemPriceUsd: true, shippingPriceUsd: true, taxUsd: true },
    });
    if (!o) return null;
    const total = o.itemPriceUsd + o.shippingPriceUsd + o.taxUsd;
    if (orderTotalQualifiesForEscrow(total)) {
      if (!isEscrowConfigured()) {
        return NextResponse.json(
          {
            error:
              "High-value alternate checkout is not configured. Set ESCROW_ENABLED=true and provider env vars (see .env.example), or complete checkout with Stripe.",
          },
          { status: 503 },
        );
      }
      return null;
    }
    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: "Stripe is not configured. Add test keys to .env (see .env.example)." },
        { status: 503 },
      );
    }
    return null;
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Stripe is not configured. Add test keys to .env (see .env.example)." },
      { status: 503 },
    );
  }
  return null;
}
