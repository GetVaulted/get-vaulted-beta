import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { isWalletVenmoEnabled } from "@/lib/payment-processor";
import {
  createBuyerVenmoSetupAuthorization,
  isBuyerVenmoPayConfigured,
} from "@/lib/paypal-buyer-venmo";

type Body = { mobileReturn?: unknown };

/**
 * Start Venmo buyer linking for Vault Wallet / Live (PayPal vault setup token).
 * Success: `{ authorizeUrl }` — client opens Venmo/PayPal approval.
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

  if (!isBuyerVenmoPayConfigured()) {
    return NextResponse.json(
      {
        error:
          "Venmo pay is not configured yet. Enable PayPal buyer Venmo vaulting (PAYPAL_BUYER_VENMO_ENABLED + PayPal client credentials) and turn on Save payment methods / Venmo in the PayPal Dashboard.",
        code: "VENMO_NOT_CONFIGURED",
      },
      { status: 503 },
    );
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    /* empty ok */
  }
  const mobileReturn = body.mobileReturn === true;

  try {
    const { authorizeUrl, setupTokenId } = await createBuyerVenmoSetupAuthorization({
      userId: auth.userId,
      mobileReturn,
    });
    return NextResponse.json({ authorizeUrl, setupTokenId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "USER_NOT_FOUND") {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }
    console.error("[venmo-setup]", e);
    return NextResponse.json(
      {
        error: "Could not start Venmo linking. Check PayPal Venmo vaulting is enabled for this app.",
        code: "VENMO_SETUP_FAILED",
      },
      { status: 502 },
    );
  }
}
