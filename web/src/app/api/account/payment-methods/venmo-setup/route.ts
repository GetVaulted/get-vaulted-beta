import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { isWalletVenmoEnabled } from "@/lib/payment-processor";
import {
  createBuyerVenmoSetupAuthorization,
  isBuyerVenmoPayConfigured,
  VenmoSetupError,
} from "@/lib/paypal-buyer-venmo";
import { apiErrorResponseFromUnknown, isPrismaMissingSchemaError } from "@/lib/prisma-api-error-response";
import { paypalCredentialsConfigured } from "@/lib/paypal-auth";

type Body = { mobileReturn?: unknown };

/**
 * Start Venmo buyer linking for Vault Wallet / Live.
 * Uses PayPal Orders (save-during-purchase + $1 auth hold, then voided).
 * Success: `{ authorizeUrl }` — client opens Venmo / PayPal checkout.
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
          "Venmo pay is not configured on the server. Set PAYPAL_BUYER_VENMO_ENABLED=true and PayPal Client ID/Secret, then redeploy.",
        code: "VENMO_NOT_CONFIGURED",
        diagnostics: {
          buyerVenmoFlag: (process.env.PAYPAL_BUYER_VENMO_ENABLED ?? "").trim() || null,
          paypalCredentialsPresent: paypalCredentialsConfigured(),
          paypalMode: (process.env.PAYPAL_MODE ?? "sandbox").trim().toLowerCase(),
        },
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
    if (e instanceof Error && e.message === "USER_NOT_FOUND") {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    if (isPrismaMissingSchemaError(e)) {
      console.error("[venmo-setup] prisma schema", e);
      return apiErrorResponseFromUnknown(e, {
        error: "Could not start Venmo linking.",
        code: "VENMO_SETUP_FAILED",
        status: 503,
      });
    }

    console.error("[venmo-setup]", e);

    if (e instanceof VenmoSetupError) {
      let error = e.userMessage;
      if (
        e.issue === "NOT_ENABLED_TO_VAULT_PAYMENT_SOURCE" ||
        e.issue === "NOT_ENABLED_FOR_VAULT_SOURCE"
      ) {
        error =
          "PayPal has not enabled Venmo vaulting on this business account yet. In paypal.com go to Account Settings → Payment preferences → Save PayPal and Venmo → Get Started, then ask PayPal support to enable Reference Transactions / vault for your Live app.";
      } else if (e.issue === "PERMISSION_DENIED" || e.issue === "NOT_AUTHORIZED") {
        error =
          "PayPal rejected Venmo permissions. Confirm PAYPAL_MODE=live matches your Live Client ID/Secret, and that PayPal and Venmo + Save payment methods are checked on the Live app.";
      }
      return NextResponse.json(
        {
          error,
          code: e.code,
          issue: e.issue,
          debugId: e.debugId,
        },
        { status: 502 },
      );
    }

    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      {
        error: `Could not start Venmo linking: ${msg.slice(0, 180)}`,
        code: "VENMO_SETUP_FAILED",
      },
      { status: 502 },
    );
  }
}
