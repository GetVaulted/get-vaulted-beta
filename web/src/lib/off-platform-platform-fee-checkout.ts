import { prisma } from "@/lib/prisma";
import { publicSiteBaseUrl } from "@/lib/live-room-share-metadata";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { ensureStripeCustomerIdForUser } from "@/lib/stripe-customer";
import { stripeCheckoutSessionPaymentOptions } from "@/lib/stripe-payment-method-config";
import { offPlatformMethodLabel } from "@/lib/off-platform-settlement";

export type OffPlatformFeeCheckoutResult =
  | { ok: true; url: string; alreadyPaid: false; feeCents: number; feeUsd: number }
  | { ok: true; url: null; alreadyPaid: true; feeCents: number; feeUsd: number }
  | { ok: false; error: string; status: number };

/**
 * Seller pays Get Vaulted the live platform fee for a host-recorded off-platform sale.
 */
export async function createOffPlatformPlatformFeeCheckout(args: {
  purchaseId: string;
  sellerUserId: string;
}): Promise<OffPlatformFeeCheckoutResult> {
  if (!isStripeConfigured()) {
    return { ok: false, error: "Payments are not configured.", status: 503 };
  }

  const purchase = await prisma.liveItemVariantPurchase.findUnique({
    where: { id: args.purchaseId },
    select: {
      id: true,
      liveRoomId: true,
      totalUsd: true,
      settlementChannel: true,
      offPlatformMethod: true,
      platformFeeCents: true,
      platformFeeStatus: true,
      platformFeePaidAt: true,
      variant: { select: { label: true } },
      liveRoom: { select: { sellerId: true } },
    },
  });
  if (!purchase) return { ok: false, error: "Sale not found.", status: 404 };
  if (purchase.liveRoom.sellerId !== args.sellerUserId) {
    return { ok: false, error: "Only the host can pay this fee.", status: 403 };
  }
  if (purchase.settlementChannel !== "off_platform") {
    return { ok: false, error: "This sale is not an off-platform settlement.", status: 409 };
  }
  if (purchase.platformFeeStatus === "paid" || purchase.platformFeePaidAt) {
    return {
      ok: true,
      url: null,
      alreadyPaid: true,
      feeCents: purchase.platformFeeCents ?? 0,
      feeUsd: (purchase.platformFeeCents ?? 0) / 100,
    };
  }
  if (purchase.platformFeeStatus === "waived" || (purchase.platformFeeCents ?? 0) <= 0) {
    return { ok: false, error: "No platform fee is due for this sale.", status: 409 };
  }
  if (purchase.platformFeeStatus !== "unpaid") {
    return { ok: false, error: "Platform fee is not payable for this sale.", status: 409 };
  }

  const feeCents = purchase.platformFeeCents!;
  const stripe = getStripe();
  const customerId = await ensureStripeCustomerIdForUser(args.sellerUserId);
  const base = publicSiteBaseUrl().replace(/\/$/, "");
  const method = offPlatformMethodLabel(purchase.offPlatformMethod);
  const label = purchase.variant.label.trim() || "team";

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      customer: customerId,
      ...stripeCheckoutSessionPaymentOptions("live"),
      success_url: `${base}/seller/live/${encodeURIComponent(purchase.liveRoomId)}?off_platform_fee=paid&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/seller/live/${encodeURIComponent(purchase.liveRoomId)}?off_platform_fee=cancelled`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: feeCents,
            product_data: {
              name: "Get Vaulted — live platform fee",
              description: `Platform fee for off-platform ${method} sale · ${label} · $${purchase.totalUsd.toFixed(2)}`,
            },
          },
        },
      ],
      metadata: {
        kind: "off_platform_platform_fee",
        purchaseId: purchase.id,
        sellerUserId: args.sellerUserId,
        liveRoomId: purchase.liveRoomId,
      },
      payment_intent_data: {
        metadata: {
          kind: "off_platform_platform_fee",
          purchaseId: purchase.id,
          sellerUserId: args.sellerUserId,
        },
      },
    },
    {
      idempotencyKey: `off_platform_fee_${purchase.id}_${feeCents}`.slice(0, 255),
    },
  );

  if (!session.url) {
    return { ok: false, error: "Could not start checkout.", status: 502 };
  }

  await prisma.liveItemVariantPurchase.update({
    where: { id: purchase.id },
    data: { platformFeeCheckoutSessionId: session.id },
  });

  return {
    ok: true,
    url: session.url,
    alreadyPaid: false,
    feeCents,
    feeUsd: feeCents / 100,
  };
}

export async function finalizeOffPlatformPlatformFeePaid(args: {
  purchaseId: string;
  sellerUserId: string;
  checkoutSessionId: string;
  paymentIntentId?: string | null;
}): Promise<void> {
  const purchase = await prisma.liveItemVariantPurchase.findUnique({
    where: { id: args.purchaseId },
    select: {
      id: true,
      platformFeeStatus: true,
      platformFeePaidAt: true,
      liveRoom: { select: { sellerId: true } },
    },
  });
  if (!purchase) return;
  if (purchase.liveRoom.sellerId !== args.sellerUserId) return;
  if (purchase.platformFeeStatus === "paid" || purchase.platformFeePaidAt) return;

  await prisma.liveItemVariantPurchase.updateMany({
    where: {
      id: args.purchaseId,
      platformFeeStatus: "unpaid",
      platformFeePaidAt: null,
    },
    data: {
      platformFeeStatus: "paid",
      platformFeePaidAt: new Date(),
      platformFeeCheckoutSessionId: args.checkoutSessionId,
      platformFeePaymentIntentId: args.paymentIntentId?.trim() || null,
    },
  });
}
