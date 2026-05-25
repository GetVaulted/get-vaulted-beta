import { NextResponse } from "next/server";
import { resolveAccountSellerUserId } from "@/lib/resolve-account-seller-user";
import { prisma } from "@/lib/prisma";
import { getSellerLiveReadiness } from "@/services/seller/live-show-readiness";
import { isRequiredSellerSetupComplete } from "@/lib/seller-setup-state";

/** Persist seller onboarding wizard completion (step 5) for cross-platform HQ unlock. */
export async function POST(req: Request) {
  const resolved = await resolveAccountSellerUserId(req);
  if (resolved instanceof NextResponse) return resolved;
  const userId = resolved.userId;

  const readiness = await getSellerLiveReadiness(userId);
  if (!isRequiredSellerSetupComplete(readiness.checks)) {
    return NextResponse.json(
      { error: "Complete payout and shipping setup before finishing seller onboarding." },
      { status: 400 },
    );
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { sellerSetupWizardCompletedAt: new Date() },
    select: { sellerSetupWizardCompletedAt: true },
  });

  return NextResponse.json({
    setupWizardComplete: Boolean(updated.sellerSetupWizardCompletedAt),
    readiness,
  });
}
