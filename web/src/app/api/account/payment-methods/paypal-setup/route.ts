import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { isWalletPayPalEnabled } from "@/lib/payment-processor";
import {
  createBuyerPayPalWalletSetupAuthorization,
  isBuyerPayPalWalletConfigured,
} from "@/lib/paypal-buyer-wallet";
import { VenmoSetupError } from "@/lib/paypal-buyer-venmo";
import { apiErrorResponseFromUnknown, isPrismaMissingSchemaError } from "@/lib/prisma-api-error-response";
import { paypalCredentialsConfigured } from "@/lib/paypal-auth";

export const runtime = "nodejs";

type Body = { mobileReturn?: unknown };

function jsonError(
  status: number,
  body: {
    error: string;
    code: string;
    issue?: string | null;
    debugId?: string | null;
    diagnostics?: unknown;
  },
) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Start PayPal Wallet buyer linking for Vault Wallet / Live.
 * Uses PayPal Orders (save-during-purchase + $1 capture, then refunded).
 */
export async function POST(req: Request) {
  try {
    const auth = await resolveAccountUserId(req, { skipStripeSiblingSync: true });
    if (auth instanceof NextResponse) return auth;

    if (!isWalletPayPalEnabled()) {
      return jsonError(403, { error: "PayPal is not enabled.", code: "PAYPAL_DISABLED" });
    }

    if (!isBuyerPayPalWalletConfigured()) {
      return jsonError(503, {
        error:
          "PayPal Wallet is not configured. Set PAYPAL_BUYER_ENABLED=true (or enable Venmo buyer pay) with PayPal Client ID/Secret, then redeploy.",
        code: "PAYPAL_WALLET_NOT_CONFIGURED",
        diagnostics: {
          buyerPayPalFlag: (process.env.PAYPAL_BUYER_ENABLED ?? "").trim() || null,
          paypalCredentialsPresent: paypalCredentialsConfigured(),
          paypalMode: (process.env.PAYPAL_MODE ?? "sandbox").trim().toLowerCase(),
        },
      });
    }

    let body: Body = {};
    try {
      body = (await req.json()) as Body;
    } catch {
      /* empty ok */
    }
    const mobileReturn = body.mobileReturn === true;

    try {
      const { authorizeUrl, setupTokenId } = await createBuyerPayPalWalletSetupAuthorization({
        userId: auth.userId,
        mobileReturn,
      });
      return NextResponse.json(
        { authorizeUrl, setupTokenId },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (e) {
      if (e instanceof Error && e.message === "USER_NOT_FOUND") {
        return jsonError(404, { error: "Account not found.", code: "USER_NOT_FOUND" });
      }
      if (isPrismaMissingSchemaError(e)) {
        return apiErrorResponseFromUnknown(e, { fallbackMessage: "Database schema needs migration." });
      }
      if (e instanceof VenmoSetupError) {
        return jsonError(502, {
          error: e.userMessage,
          code: e.code,
          issue: e.issue,
          debugId: e.debugId,
        });
      }
      console.error("[paypal-setup]", e);
      return jsonError(502, {
        error: e instanceof Error ? e.message : "PayPal linking failed.",
        code: "PAYPAL_SETUP_FAILED",
      });
    }
  } catch (e) {
    console.error("[paypal-setup] outer", e);
    return jsonError(500, {
      error: e instanceof Error ? e.message : "PayPal linking failed.",
      code: "PAYPAL_SETUP_FAILED",
    });
  }
}
