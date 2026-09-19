import { NextResponse } from "next/server";
import { isBuyerVenmoPayConfigured, paypalCredentialsConfigured } from "@/lib/paypal-auth";
import { isWalletVenmoEnabled } from "@/lib/payment-processor";

/**
 * Public Venmo config health (no secrets). Open in a browser to verify deploy + env.
 * GET /api/health/venmo
 */
export async function GET() {
  const flag = (process.env.PAYPAL_BUYER_VENMO_ENABLED ?? "").trim();
  const mode = (process.env.PAYPAL_MODE ?? "sandbox").trim().toLowerCase();
  return NextResponse.json(
    {
      ok: true,
      walletVenmoUiEnabled: isWalletVenmoEnabled(),
      buyerVenmoConfigured: isBuyerVenmoPayConfigured(),
      paypalCredentialsPresent: paypalCredentialsConfigured(),
      paypalBuyerVenmoFlag: flag || null,
      paypalMode: mode,
      commit: process.env.COMMIT_REF?.slice(0, 8) ?? process.env.SITE_ID?.slice(0, 8) ?? null,
      deployId: process.env.DEPLOY_ID?.slice(0, 12) ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
