import { NextResponse } from "next/server";
import { isPayPalSellerPayoutsEnabled } from "@/lib/paypal";
import { paypalCredentialsConfigured } from "@/lib/paypal-auth";

/**
 * Public seller-PayPal config health (no secrets).
 * GET /api/health/paypal-seller
 */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      paypalCredentialsPresent: paypalCredentialsConfigured(),
      paypalSellerPayoutsEnabled: isPayPalSellerPayoutsEnabled(),
      paypalMode: (process.env.PAYPAL_MODE ?? "sandbox").trim().toLowerCase(),
      sellerPayoutsFlag:
        process.env.PAYPAL_SELLER_PAYOUTS_ENABLED?.trim() || null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
