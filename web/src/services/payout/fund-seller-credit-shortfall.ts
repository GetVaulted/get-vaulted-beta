import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { estimateStripeProcessingFeeCents } from "@/lib/seller-payout-estimate";
import { ensureOrderPlatformFeeSnapshotPersisted } from "@/lib/live-show-gmv";
import { OrderPayoutStatus, OrderPaymentMethod } from "@/generated/prisma/enums";

/**
 * When a buyer spends referral + Get Vaulted (platform) credit, the seller is still meant to
 * receive full sale price. Most of that gap is absorbed by reducing Get Vaulted's own platform
 * fee on the order (see `connectPaymentIntentTransferData` / `resolveConnectPaymentTaxPlan`) —
 * but Stripe will never let a single charge's destination transfer exceed what the buyer was
 * actually charged, so once credit is larger than the fee + processing cost, there's a real gap
 * the charge itself cannot cover.
 *
 * This tops up that gap with a direct Stripe Connect Transfer from Get Vaulted's own balance, so
 * sellers are made whole regardless of credit size. Best-effort, idempotent, never blocks order
 * finalize — a failure here flags the order for manual review instead of silently under-paying
 * the seller or throwing during checkout.
 */
export async function fundSellerCreditShortfallIfNeeded(orderId: string): Promise<void> {
  const id = orderId?.trim();
  if (!id) return;

  try {
    // Belt-and-suspenders: guarantee the charge-time platform fee snapshot exists before we read
    // it below. No-ops if already persisted (never overwrites an existing snapshot).
    await ensureOrderPlatformFeeSnapshotPersisted(id);

    const order = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        sellerId: true,
        paymentStatus: true,
        paymentMethod: true,
        payoutStatus: true,
        payoutBlockedReason: true,
        sellerPayoutProcessor: true,
        itemPriceUsd: true,
        shippingPriceUsd: true,
        taxUsd: true,
        referralCreditAppliedUsd: true,
        platformCreditAppliedUsd: true,
        platformFeeCents: true,
        stripePaymentIntentId: true,
        sellerCreditShortfallTransferId: true,
        sellerCreditShortfallFundedAt: true,
        seller: { select: { stripeAccountId: true } },
      },
    });
    if (!order) return;
    if (order.paymentStatus !== "paid") return;
    if (order.paymentMethod === OrderPaymentMethod.escrow) return;
    // PayPal seller payouts are computed off the full (pre-credit) sale basis directly — see
    // `paypal-seller-payout.ts` — so there's no charge-amount ceiling to top up in the first place.
    if (order.sellerPayoutProcessor === "PAYPAL") return;
    if (order.sellerCreditShortfallTransferId || order.sellerCreditShortfallFundedAt) return;

    const creditCents =
      Math.round(Math.max(0, order.referralCreditAppliedUsd ?? 0) * 100) +
      Math.round(Math.max(0, order.platformCreditAppliedUsd ?? 0) * 100);
    if (creditCents < 1) return;

    const platformFeeCents = Math.max(0, order.platformFeeCents ?? 0);
    const amountCents = Math.round(
      Math.max(0, order.itemPriceUsd + order.shippingPriceUsd + (order.taxUsd ?? 0)) * 100,
    );
    // Mirrors the exact processing-fee estimate used at charge-creation time
    // (`connectPaymentIntentTransferData` callers) so this reconciles with what actually happened.
    const processingFeeCents = platformFeeCents > 0 ? estimateStripeProcessingFeeCents(amountCents) : 0;

    const shortfallCents = Math.max(0, creditCents - platformFeeCents - processingFeeCents);
    if (shortfallCents < 1) return;

    const flagForManualReview = async (detail: string) => {
      console.error("[credit-shortfall] could not fund automatically", { orderId: id, shortfallCents, detail });
      await prisma.order.update({
        where: { id },
        data: {
          sellerCreditShortfallCents: shortfallCents,
          sellerCreditShortfallFailedAt: new Date(),
          sellerCreditShortfallFailureDetail: detail.slice(0, 500),
          ...(order.payoutStatus === OrderPayoutStatus.paid_out || order.payoutStatus === OrderPayoutStatus.blocked
            ? {}
            : {
                payoutStatus: OrderPayoutStatus.manual_review,
                payoutBlockedReason: `Credit shortfall of $${(shortfallCents / 100).toFixed(2)} could not be auto-funded to the seller (${detail}). Needs a manual Connect transfer.`,
              }),
        },
      });
    };

    const destination = order.seller.stripeAccountId?.trim() || null;
    if (!destination) {
      await flagForManualReview("SELLER_NO_CONNECT_ACCOUNT");
      return;
    }
    if (!isStripeConfigured()) {
      await flagForManualReview("STRIPE_NOT_CONFIGURED");
      return;
    }

    const idempotencyKey = `credit_shortfall_${id}`;
    await prisma.order.update({
      where: { id },
      data: {
        sellerCreditShortfallCents: shortfallCents,
        sellerCreditShortfallIdempotencyKey: idempotencyKey,
      },
    });

    const stripe = getStripe();
    try {
      // Preflight so a mistaken/huge grant fails loudly (flagged for you) instead of the Stripe
      // API call itself failing deep in checkout finalize.
      const balance = await stripe.balance.retrieve();
      const availableCents = (balance.available ?? [])
        .filter((b) => b.currency === "usd")
        .reduce((sum, b) => sum + (b.amount ?? 0), 0);
      if (availableCents < shortfallCents) {
        await flagForManualReview(
          `INSUFFICIENT_PLATFORM_BALANCE available=${availableCents} needed=${shortfallCents}`,
        );
        return;
      }

      const transfer = await stripe.transfers.create(
        {
          amount: shortfallCents,
          currency: "usd",
          destination,
          description: `Get Vaulted credit shortfall funding for order ${id}`,
          metadata: {
            orderId: id,
            reason: "buyer_credit_shortfall",
            kind: "credit_shortfall_funding",
            creditCents: String(creditCents),
            platformFeeCents: String(platformFeeCents),
          },
          ...(order.stripePaymentIntentId?.trim() ? { transfer_group: order.stripePaymentIntentId.trim() } : {}),
        },
        { idempotencyKey },
      );

      await prisma.order.update({
        where: { id },
        data: {
          sellerCreditShortfallTransferId: transfer.id,
          sellerCreditShortfallFundedAt: new Date(),
          sellerCreditShortfallFailedAt: null,
          sellerCreditShortfallFailureDetail: null,
        },
      });

      console.info("[credit-shortfall] funded", { orderId: id, shortfallCents, transferId: transfer.id });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await flagForManualReview(`TRANSFER_FAILED: ${message}`);
    }
  } catch (e) {
    console.error("[credit-shortfall] unexpected error", { orderId, error: e });
  }
}
