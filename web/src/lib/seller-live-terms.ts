import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Bump this whenever the seller / live-content terms change in a way sellers must re-accept
 * (Terms §7.1). Sellers whose stored `sellerTermsVersion` differs are asked to accept before
 * they can start a live show.
 */
export const CURRENT_SELLER_TERMS_VERSION = "2026-10-06";

export const SELLER_TERMS_REQUIRED_CODE = "SELLER_TERMS_REQUIRED";

/** True when this account must accept the current seller live-content terms before going live. */
export async function sellerLiveTermsRequired(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, sellerTermsVersion: true },
  });
  if (!user) return false;
  // Admins operate shows on sellers' behalf and are not bound by the seller agreement.
  if (user.role === "admin") return false;
  return user.sellerTermsVersion !== CURRENT_SELLER_TERMS_VERSION;
}

export function sellerTermsRequiredResponse() {
  return NextResponse.json(
    {
      error: "Please accept the updated seller terms before you go live.",
      code: SELLER_TERMS_REQUIRED_CODE,
      termsVersion: CURRENT_SELLER_TERMS_VERSION,
    },
    { status: 403 },
  );
}

export async function recordSellerLiveTermsAcceptance(userId: string, at: Date = new Date()) {
  return prisma.user.update({
    where: { id: userId },
    data: { sellerTermsVersion: CURRENT_SELLER_TERMS_VERSION, sellerTermsAcceptedAt: at },
    select: { sellerTermsVersion: true, sellerTermsAcceptedAt: true },
  });
}
