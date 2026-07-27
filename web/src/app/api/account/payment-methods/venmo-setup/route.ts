import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { isWalletVenmoEnabled } from "@/lib/payment-processor";
import {
  createBuyerVenmoSetupAuthorization,
  isBuyerVenmoPayConfigured,
  parsePayPalErrorBody,
} from "@/lib/paypal-buyer-venmo";

type Body = { mobileReturn?: unknown };

/**
 * Start Venmo buyer linking for Vault Wallet / Live.
 * Uses PayPal Orders (save-during-purchase + $1 verification refunded).
 * Success: `{ authorizeUrl }` — client opens Venmo approval.
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

    // VENMO_SETUP_FAILED:status:issue:debugId:raw…
    const parts = msg.split(":");
    const issue = parts[2] && parts[2] !== "UNKNOWN" ? parts[2] : null;
    const debugId = parts[3] || null;
    const rawTail = parts.slice(4).join(":");
    const parsed = parsePayPalErrorBody(rawTail);

    let error =
      "Could not start Venmo linking. Check PayPal Venmo vaulting is enabled for this app.";
    if (issue === "NOT_ENABLED_TO_VAULT_PAYMENT_SOURCE" || issue === "NOT_ENABLED_FOR_VAULT_SOURCE") {
      error =
        "PayPal has not enabled Venmo vaulting on this business account yet. In paypal.com go to Account Settings → Payment preferences → Save PayPal and Venmo → Get Started, then ask PayPal support to enable Reference Transactions / vault for your Live app.";
    } else if (issue === "PERMISSION_DENIED" || issue === "NOT_AUTHORIZED") {
      error =
        "PayPal rejected Venmo permissions. Confirm PAYPAL_MODE=live matches your Live Client ID/Secret, and that PayPal and Venmo + Save payment methods are checked on the Live app.";
    } else if (parsed.message) {
      error = parsed.message;
    } else if (issue) {
      error = `PayPal error: ${issue}`;
    }

    return NextResponse.json(
      {
        error,
        code: "VENMO_SETUP_FAILED",
        issue: issue || parsed.issue,
        debugId: debugId || parsed.debugId,
      },
      { status: 502 },
    );
  }
}
