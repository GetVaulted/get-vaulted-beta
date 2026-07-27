import { NextResponse } from "next/server";
import {
  completeBuyerVenmoSetupFromToken,
  verifyVenmoSetupState,
} from "@/lib/paypal-buyer-venmo";
import { prisma } from "@/lib/prisma";
import { clearBuyerLiveWalletReadinessCache } from "@/lib/buyer-live-wallet-readiness";

function siteOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

/**
 * PayPal/Venmo return URL after buyer approves vaulting.
 * Completes payment-token create and redirects to account (or mobile deep link).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("uid")?.trim() ?? "";
  const nonce = url.searchParams.get("nonce")?.trim() ?? "";
  const sig = url.searchParams.get("sig")?.trim() ?? "";
  const mobileFlag = url.searchParams.get("mobile") === "1";

  const failRedirect = (reason: string, mobile: boolean) => {
    if (mobile) {
      return NextResponse.redirect(`getvaulted://wallet?venmo=error&reason=${encodeURIComponent(reason)}`);
    }
    return NextResponse.redirect(
      `${siteOrigin()}/account/payment-methods?venmo=error&reason=${encodeURIComponent(reason)}`,
    );
  };

  if (!userId || !nonce || !sig || !verifyVenmoSetupState({ userId, nonce, sig })) {
    return failRedirect("invalid_state", mobileFlag);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      venmoPendingSetupTokenId: true,
      venmoPendingSetupNonce: true,
      venmoPendingSetupMobile: true,
    },
  });
  if (!user?.venmoPendingSetupTokenId?.trim()) {
    return failRedirect("missing_setup", mobileFlag || user?.venmoPendingSetupMobile === true);
  }
  if (user.venmoPendingSetupNonce?.trim() !== nonce) {
    return failRedirect("nonce_mismatch", mobileFlag || user.venmoPendingSetupMobile);
  }

  const mobile = mobileFlag || user.venmoPendingSetupMobile === true;

  try {
    await completeBuyerVenmoSetupFromToken({
      userId,
      setupTokenId: user.venmoPendingSetupTokenId.trim(),
    });
    clearBuyerLiveWalletReadinessCache(userId);
    if (mobile) {
      return NextResponse.redirect("getvaulted://wallet?venmo=connected");
    }
    return NextResponse.redirect(`${siteOrigin()}/account/payment-methods?venmo=connected`);
  } catch (e) {
    console.error("[venmo-callback]", e);
    return failRedirect("vault_failed", mobile);
  }
}
