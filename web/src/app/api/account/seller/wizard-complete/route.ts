import { NextResponse } from "next/server";
import { scheduleNotifyAdmins } from "@/lib/admin/notify-admins";
import { syncStripeConnectFromEmailSibling } from "@/lib/link-stripe-account-from-email-sibling";
import { refreshSellerStripeFromStripeApi } from "@/lib/refresh-seller-stripe-from-api";
import { resolveAccountSellerUserId } from "@/lib/resolve-account-seller-user";
import { prisma } from "@/lib/prisma";
import { getSellerLiveReadiness } from "@/services/seller/live-show-readiness";
import { isPayoutSetupSubmitted, isRequiredSellerSetupComplete } from "@/lib/seller-setup-state";
import { isStripeConfigured } from "@/lib/stripe";
import { isStripePayoutSetupSubmittedFromAccount } from "@/lib/stripe-payout-submitted";

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
    select: {
      sellerAgreementAcceptedAt: true,
      sellerSetupWizardCompletedAt: true,
      username: true,
      email: true,
      stripeAccountId: true,
    },
  });
  if (!existing?.sellerAgreementAcceptedAt && !sellerAgreementAccepted) {
    return NextResponse.json(
      { error: "Accept the seller agreement before finishing setup." },
      { status: 400 },
    );
  }

  // Pull latest Connect state before gating — mobile often finishes Stripe UI before webhooks land.
  let liveStripeSubmitted = false;
  if (isStripeConfigured()) {
    try {
      await syncStripeConnectFromEmailSibling(userId);
    } catch (e) {
      console.warn("[wizard-complete] stripe sibling sync failed", e);
    }
    const stripeRow = await prisma.user.findUnique({
      where: { id: userId },
      select: { stripeAccountId: true },
    });
    const accountId = stripeRow?.stripeAccountId?.trim();
    if (accountId) {
      try {
        const { account } = await refreshSellerStripeFromStripeApi({ userId, stripeAccountId: accountId });
        liveStripeSubmitted = isStripePayoutSetupSubmittedFromAccount(account);
      } catch (e) {
        console.warn("[wizard-complete] stripe refresh failed", e);
      }
    }
  }

  const readiness = await getSellerLiveReadiness(userId);
  const checks = {
    ...readiness.checks,
    stripePayoutSubmitted: readiness.checks.stripePayoutSubmitted || liveStripeSubmitted,
  };
  if (!isRequiredSellerSetupComplete(checks)) {
    const missing: string[] = [];
    if (!isPayoutSetupSubmitted(checks)) {
      if (checks.preferredSellerPayoutProcessor === "PAYPAL") {
        missing.push("add and verify your PayPal payout email");
      } else {
        missing.push("connect Stripe payouts or choose PayPal and verify your email");
        if (!checks.hasStripeAccount) {
          /* covered by message above */
        } else if (!checks.stripePayoutSubmitted && !checks.stripeChargesEnabled) {
          missing.push("submit Stripe payout details (open Continue Stripe if anything is still due)");
        }
      }
    }
    if (!checks.hasShipFromAddress) missing.push("add your ship-from address");
    const detail = missing.length ? ` Still needed: ${missing.join("; ")}.` : "";
    return NextResponse.json(
      {
        error: `Complete payout and shipping setup before finishing seller onboarding.${detail}`,
        code: "SELLER_SETUP_INCOMPLETE",
        checks,
        issues: readiness.issues,
      },
      { status: 400 },
    );
  }

  const firstCompletion = !existing?.sellerSetupWizardCompletedAt;
  const now = new Date();
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      sellerSetupWizardCompletedAt: existing?.sellerSetupWizardCompletedAt ?? now,
      sellerAgreementAcceptedAt: existing?.sellerAgreementAcceptedAt ?? now,
    },
    select: { sellerSetupWizardCompletedAt: true, sellerAgreementAcceptedAt: true },
  });

  if (firstCompletion) {
    const handle = existing?.username?.trim() || "seller";
    const email = existing?.email?.trim() || "unknown";
    const verified = checks.paypalPayoutReady || checks.stripeChargesEnabled;
    scheduleNotifyAdmins({
      type: "admin_seller_onboarded",
      title: "Seller onboarding complete",
      body: verified
        ? `@${handle} (${email}) finished seller setup and can go live / list.`
        : `@${handle} (${email}) finished seller setup; Stripe verification is still pending before they can go live / publish.`,
      href: "/admin/users",
      dedupeKey: `seller-onboard:${userId}`,
    });
  }

  return NextResponse.json({
    setupWizardComplete: Boolean(updated.sellerSetupWizardCompletedAt),
    readiness: { ...readiness, checks },
  });
}
