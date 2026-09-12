import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { finalizeBuyerPaymentMethodSetup } from "@/lib/stripe-buyer-payment-method-setup";
import { isStripeConfigured } from "@/lib/stripe";

type Body = {
  paymentMethodId?: unknown;
  setupIntentId?: unknown;
  clientSecret?: unknown;
};

/**
 * After mobile/web SetupIntent confirmation, attach the card, set customer default,
 * and detach expired cards so recovery retries use the new PM.
 */
export async function POST(req: Request) {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    /* empty ok */
  }

  const paymentMethodId =
    typeof body.paymentMethodId === "string" ? body.paymentMethodId.trim() : undefined;
  const setupIntentId = typeof body.setupIntentId === "string" ? body.setupIntentId.trim() : undefined;
  const clientSecret = typeof body.clientSecret === "string" ? body.clientSecret.trim() : undefined;

  const auth = await resolveAccountUserId(req, { skipStripeSiblingSync: true });
  if (auth instanceof NextResponse) return auth;

  console.log("[payment recovery] finalize route hit", {
    hasPaymentMethodId: Boolean(paymentMethodId),
    hasSetupIntentId: Boolean(setupIntentId),
    hasClientSecret: Boolean(clientSecret),
    userId: auth.userId,
  });

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  }

  if (!paymentMethodId && !setupIntentId && !clientSecret) {
    return NextResponse.json(
      { error: "paymentMethodId, setupIntentId, or clientSecret is required." },
      { status: 400 },
    );
  }

  try {
    const result = await finalizeBuyerPaymentMethodSetup({
      userId: auth.userId,
      paymentMethodId,
      setupIntentId,
      clientSecret,
    });
    console.log("[payment recovery] finalize route success", {
      userId: auth.userId,
      paymentMethodId: result.paymentMethodId,
      expMonth: result.expMonth,
      expYear: result.expYear,
    });
    return NextResponse.json({
      ok: true,
      paymentMethodId: result.paymentMethodId,
      expMonth: result.expMonth,
      expYear: result.expYear,
      brand: result.brand,
      last4: result.last4,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not finalize payment method.";
    if (msg === "SETUP_INTENT_NOT_OWNED" || msg === "PM_NOT_OWNED") {
      return NextResponse.json({ error: "That payment method does not belong to your account." }, { status: 403 });
    }
    if (msg.startsWith("SETUP_INTENT_NOT_SUCCEEDED")) {
      return NextResponse.json({ error: "Card setup did not complete. Try again." }, { status: 409 });
    }
    if (
      msg === "SETUP_INTENT_ID_REQUIRED" ||
      msg === "SETUP_INTENT_PM_MISSING" ||
      msg === "INVALID_PAYMENT_METHOD" ||
      msg === "PAYMENT_METHOD_ID_REQUIRED"
    ) {
      return NextResponse.json({ error: "Invalid payment method or setup intent." }, { status: 400 });
    }
    console.error("[payment recovery] finalize route error", {
      userId: auth.userId,
      paymentMethodId: paymentMethodId ?? null,
      message: msg,
      error: e,
    });
    return NextResponse.json({ error: "Could not save payment method. Try again." }, { status: 500 });
  }
}
