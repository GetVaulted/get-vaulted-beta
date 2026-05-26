import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { listBuyerCardPaymentMethods } from "@/lib/stripe-customer";
import { isStripeConfigured } from "@/lib/stripe";

export type PaymentMethodApiRow = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
};

/**
 * Buyer saved card payment methods (Stripe Customer + PaymentMethod).
 */
export async function GET(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  if (!isStripeConfigured()) {
    return NextResponse.json({
      paymentMethods: [] as PaymentMethodApiRow[],
      stripeConfigured: false,
      message: "Stripe is not configured on this server. Saved cards are unavailable until payments are enabled.",
    });
  }

  try {
    const paymentMethods = await listBuyerCardPaymentMethods(auth.userId);
    return NextResponse.json({
      paymentMethods,
      stripeConfigured: true,
    });
  } catch (e) {
    console.error("[api/account/payment-methods]", e);
    return NextResponse.json(
      {
        paymentMethods: [] as PaymentMethodApiRow[],
        stripeConfigured: true,
        message: "Could not load saved cards from Stripe. Check your keys and try again.",
      },
      { status: 503 },
    );
  }
}
