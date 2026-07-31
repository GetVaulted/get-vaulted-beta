import { NextResponse } from "next/server";
import {
  completeBuyerPayPalWalletSetupFromToken,
  verifyPayPalWalletSetupState,
} from "@/lib/paypal-buyer-wallet";
import { prisma } from "@/lib/prisma";
import { clearBuyerLiveWalletReadinessCache } from "@/lib/buyer-live-wallet-readiness";

function siteOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

/** PayPal return URL after buyer approves PayPal Wallet vaulting. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("uid")?.trim() ?? "";
  const nonce = url.searchParams.get("nonce")?.trim() ?? "";
  const sig = url.searchParams.get("sig")?.trim() ?? "";
  const mobileFlag = url.searchParams.get("mobile") === "1";

  const failRedirect = (reason: string, mobile: boolean) => {
    if (mobile) {
      return NextResponse.redirect(`getvaulted://wallet?paypal=error&reason=${encodeURIComponent(reason)}`);
    }
    return NextResponse.redirect(
      `${siteOrigin()}/account/payment-methods?paypal=error&reason=${encodeURIComponent(reason)}`,
    );
  };

  if (!userId || !nonce || !sig || !verifyPayPalWalletSetupState({ userId, nonce, sig })) {
    return failRedirect("invalid_state", mobileFlag);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      paypalPendingSetupTokenId: true,
      paypalPendingSetupNonce: true,
      paypalPendingSetupMobile: true,
    },
  });
  if (!user?.paypalPendingSetupTokenId?.trim()) {
    return failRedirect("missing_setup", mobileFlag || user?.paypalPendingSetupMobile === true);
  }
  if (user.paypalPendingSetupNonce?.trim() !== nonce) {
    return failRedirect("nonce_mismatch", mobileFlag || user.paypalPendingSetupMobile);
  }

  const mobile = mobileFlag || user.paypalPendingSetupMobile === true;

  try {
    await completeBuyerPayPalWalletSetupFromToken({
      userId,
      setupTokenId: user.paypalPendingSetupTokenId.trim(),
    });
    clearBuyerLiveWalletReadinessCache(userId);
    if (mobile) {
      return NextResponse.redirect("getvaulted://wallet?paypal=connected");
    }
    return NextResponse.redirect(`${siteOrigin()}/account/payment-methods?paypal=connected`);
  } catch (e) {
    console.error("[paypal-callback]", e);
    return failRedirect("vault_failed", mobile);
  }
}
