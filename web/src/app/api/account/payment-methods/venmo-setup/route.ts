import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { isWalletVenmoEnabled } from "@/lib/payment-processor";

/**
 * Start Venmo buyer linking for Vault Wallet / Live.
 *
 * UI already calls this when the buyer picks Venmo. Finish the PayPal/Venmo backend here.
 *
 * Expected success response (implement when ready):
 *   { authorizeUrl: string }  — client opens this to complete Venmo auth
 * Optional later:
 *   { paymentMethodId: string, brand?: string, last4?: string } — if linking completes in-API
 */
export async function POST(req: Request) {
  const auth = await resolveAccountUserId(req, { skipStripeSiblingSync: true });
  if (auth instanceof NextResponse) return auth;

  if (!isWalletVenmoEnabled()) {
    return NextResponse.json(
      { error: "Venmo is not enabled.", code: "VENMO_DISABLED" },
      { status: 403 },
    );
  }

  // TODO: Wire PayPal/Venmo buyer linking (OAuth / billing agreement) and return authorizeUrl.
  void auth.userId;
  return NextResponse.json(
    {
      error: "Venmo linking is not configured on the server yet.",
      code: "VENMO_BACKEND_PENDING",
    },
    { status: 501 },
  );
}
