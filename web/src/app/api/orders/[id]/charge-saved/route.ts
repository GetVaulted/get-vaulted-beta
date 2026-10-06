import { NextResponse } from "next/server";
import { getServerSessionSafe } from "@/lib/auth";
import { checkoutInfrastructureGate } from "@/lib/checkout-infrastructure";
import { chargeMarketplaceOrderWithSavedPaymentMethod, syncMarketplaceOrderPaymentIntent } from "@/lib/stripe-charge-order-saved-pm";
import { getStripePublishableKey } from "@/lib/stripe";

type Body = { sync?: boolean; applyReferralCredit?: boolean };

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: raw } = await ctx.params;
  const orderId = decodeURIComponent(raw);

  let sync = false;
  let applyReferralCredit = false;
  try {
    const body = (await req.json()) as Body;
    if (body?.sync === true) sync = true;
    if (body?.applyReferralCredit === true) applyReferralCredit = true;
  } catch {
    // empty body
  }

  try {
    const gate = await checkoutInfrastructureGate("pay_order", { orderId });
    if (gate) return gate;

    const result = sync
      ? await syncMarketplaceOrderPaymentIntent({ buyerId: session.user.id, orderId })
      : await chargeMarketplaceOrderWithSavedPaymentMethod({
          buyerId: session.user.id,
          orderId,
          applyReferralCredit,
        });

    const publishableKey = getStripePublishableKey();

    if (result.outcome === "paid") {
      return NextResponse.json({ ok: true, publishableKey });
    }
    if (result.outcome === "requires_action") {
      if (!publishableKey) {
        return NextResponse.json(
          { error: "Stripe publishable key is missing. Set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY." },
          { status: 503 },
        );
      }
      return NextResponse.json({
        ok: false,
        requiresAction: true,
        clientSecret: result.clientSecret,
        paymentIntentId: result.paymentIntentId,
        publishableKey,
      });
    }
    if (result.outcome === "processing") {
      return NextResponse.json({ ok: false, processing: true, publishableKey });
    }

    const map: Record<string, { status: number; msg: string }> = {
      STRIPE_NOT_CONFIGURED: { status: 503, msg: "Stripe is not configured. Add keys to .env (see .env.example)." },
      ORDER_NOT_FOUND: { status: 404, msg: "Order not found." },
      ORDER_PAYMENT_EXPIRED: { status: 409, msg: "Payment window expired." },
      ALREADY_PAID: { status: 409, msg: "Already paid." },
      ORDER_NOT_PAYABLE: { status: 409, msg: "This order is not awaiting payment." },
      USE_ESCROW_CHECKOUT: { status: 409, msg: "Use secure checkout for this order total." },
      ESCROW_NOT_CONFIGURED: {
        status: 503,
        msg: "High-value alternate checkout is not configured. Set ESCROW_ENABLED=true and provider env vars (see .env.example), or use Stripe checkout.",
      },
      ORDER_NOT_ELIGIBLE_SAVED_CARD: { status: 400, msg: "Saved-card charge is only available for auction wins awaiting payment." },
      REQUIRES_CHECKOUT_FOR_TAX: {
        status: 409,
        msg: "Secure checkout required for tax calculation.",
      },
      SELLER_NOT_READY: { status: 409, msg: "Seller has not finished Stripe Connect onboarding." },
      ORDER_SAVED_PM_MISSING: {
        status: 400,
        msg: "No saved card on this order. Add a card when bidding or use Stripe Checkout below.",
      },
      PM_NOT_OWNED: { status: 403, msg: "That payment method is not available on your account." },
      PM_NOT_FOUND: { status: 400, msg: "Payment method not found." },
      PM_VALIDATION_FAILED: { status: 400, msg: "Could not validate payment method." },
      BUYER_STRIPE_CUSTOMER_MISSING: { status: 400, msg: "Missing Stripe customer on your account. Add a card in Wallet first." },
      INVALID_ORDER_AMOUNT: { status: 400, msg: "Invalid order amount." },
      MISSING_CLIENT_SECRET: { status: 500, msg: "Payment processor returned an incomplete response." },
      NO_PAYMENT_INTENT: { status: 400, msg: "No payment in progress. Try Pay with saved card again." },
      PAYMENT_INTENT_NOT_COMPLETED: { status: 409, msg: "Payment did not complete. You can try again or use Checkout." },
      CARD_DECLINED: { status: 402, msg: "Card was declined. Try another card via Checkout." },
      STRIPE_ERROR: { status: 502, msg: "Payment processor error. Try again or use Checkout." },
    };
    const hit = map[result.code];
    if (hit) return NextResponse.json({ error: hit.msg }, { status: hit.status });
    return NextResponse.json({ error: "Could not process payment." }, { status: 500 });
  } catch (e) {
    console.error("[api/orders/charge-saved]", { orderId, sync }, e);
    return NextResponse.json({ error: "Could not process payment. Try again or use Stripe Checkout." }, { status: 500 });
  }
}
