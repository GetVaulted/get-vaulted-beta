import { NextResponse } from "next/server";
import { SellerPayoutProcessor } from "@/generated/prisma/enums";
import { resolveAccountSellerUserId } from "@/lib/resolve-account-seller-user";
import { prisma } from "@/lib/prisma";
import { isPayPalSellerPayoutsEnabled } from "@/lib/paypal";
import {
  normalizePayPalPayoutEmail,
  sellerPayoutRailSelect,
} from "@/lib/seller-payout-rail";

export const runtime = "nodejs";

/** GET current seller payout rail preference + readiness. */
export async function GET(req: Request) {
  const resolved = await resolveAccountSellerUserId(req);
  if (resolved instanceof NextResponse) return resolved;

  const user = await prisma.user.findUnique({
    where: { id: resolved.userId },
    select: {
      ...sellerPayoutRailSelect,
      paypalMerchantId: true,
    },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    paypalSellerPayoutsEnabled: isPayPalSellerPayoutsEnabled(),
    preferredSellerPayoutProcessor: user.preferredSellerPayoutProcessor,
    paypalPayoutEmail: user.paypalPayoutEmail,
    paypalPayoutVerifiedAt: user.paypalPayoutVerifiedAt?.toISOString() ?? null,
    paypalMerchantId: user.paypalMerchantId,
    stripeAccountId: user.stripeAccountId,
    stripeOnboardingComplete: user.stripeOnboardingComplete,
  });
}

type PatchBody = {
  preferredSellerPayoutProcessor?: unknown;
  paypalPayoutEmail?: unknown;
  /** When true, marks the provided email as verified (seller confirms ownership). */
  verifyPayPalEmail?: unknown;
};

/** PATCH seller payout preference (Stripe Connect vs PayPal). */
export async function PATCH(req: Request) {
  const resolved = await resolveAccountSellerUserId(req);
  if (resolved instanceof NextResponse) return resolved;
  const userId = resolved.userId;

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: {
    preferredSellerPayoutProcessor?: SellerPayoutProcessor;
    paypalPayoutEmail?: string | null;
    paypalPayoutVerifiedAt?: Date | null;
  } = {};

  if (typeof body.preferredSellerPayoutProcessor === "string") {
    const pref = body.preferredSellerPayoutProcessor.toUpperCase();
    if (pref !== "STRIPE" && pref !== "PAYPAL") {
      return NextResponse.json({ error: "Invalid payout processor" }, { status: 400 });
    }
    if (pref === "PAYPAL" && !isPayPalSellerPayoutsEnabled()) {
      return NextResponse.json(
        { error: "PayPal seller payouts are not enabled on this environment." },
        { status: 403 },
      );
    }
    data.preferredSellerPayoutProcessor = pref as SellerPayoutProcessor;
  }

  if (body.paypalPayoutEmail !== undefined) {
    if (body.paypalPayoutEmail === null || body.paypalPayoutEmail === "") {
      data.paypalPayoutEmail = null;
      data.paypalPayoutVerifiedAt = null;
    } else if (typeof body.paypalPayoutEmail === "string") {
      const email = normalizePayPalPayoutEmail(body.paypalPayoutEmail);
      if (!email) {
        return NextResponse.json({ error: "Invalid PayPal email" }, { status: 400 });
      }
      const existing = await prisma.user.findUnique({
        where: { id: userId },
        select: { paypalPayoutEmail: true },
      });
      data.paypalPayoutEmail = email;
      if (existing?.paypalPayoutEmail?.toLowerCase() !== email) {
        data.paypalPayoutVerifiedAt = null;
      }
    }
  }

  if (body.verifyPayPalEmail === true) {
    const email =
      data.paypalPayoutEmail ??
      (
        await prisma.user.findUnique({
          where: { id: userId },
          select: { paypalPayoutEmail: true },
        })
      )?.paypalPayoutEmail;
    if (!email?.trim()) {
      return NextResponse.json({ error: "Add a PayPal email before verifying." }, { status: 400 });
    }
    data.paypalPayoutVerifiedAt = new Date();
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No changes" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data,
    select: {
      ...sellerPayoutRailSelect,
      paypalMerchantId: true,
    },
  });

  return NextResponse.json({
    paypalSellerPayoutsEnabled: isPayPalSellerPayoutsEnabled(),
    preferredSellerPayoutProcessor: updated.preferredSellerPayoutProcessor,
    paypalPayoutEmail: updated.paypalPayoutEmail,
    paypalPayoutVerifiedAt: updated.paypalPayoutVerifiedAt?.toISOString() ?? null,
    paypalMerchantId: updated.paypalMerchantId,
    stripeAccountId: updated.stripeAccountId,
    stripeOnboardingComplete: updated.stripeOnboardingComplete,
  });
}
