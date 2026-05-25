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

  let sellerAgreementAccepted = false;
  try {
    const body = (await req.json()) as { sellerAgreementAccepted?: boolean };
    sellerAgreementAccepted = body.sellerAgreementAccepted === true;
  } catch {
    /* empty body ok when agreement already recorded */
  }

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { sellerAgreementAcceptedAt: true },
  });
  if (!existing?.sellerAgreementAcceptedAt && !sellerAgreementAccepted) {
    return NextResponse.json(
      { error: "Accept the seller agreement before finishing setup." },
      { status: 400 },
    );
  }

  const readiness = await getSellerLiveReadiness(userId);
  if (!isRequiredSellerSetupComplete(readiness.checks)) {
    return NextResponse.json(
      { error: "Complete payout and shipping setup before finishing seller onboarding." },
      { status: 400 },
    );
  }

  const now = new Date();
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      sellerSetupWizardCompletedAt: now,
      sellerAgreementAcceptedAt: existing?.sellerAgreementAcceptedAt ?? now,
    },
    select: { sellerSetupWizardCompletedAt: true, sellerAgreementAcceptedAt: true },
  });

  return NextResponse.json({
    setupWizardComplete: Boolean(updated.sellerSetupWizardCompletedAt),
    readiness,
  });
}
