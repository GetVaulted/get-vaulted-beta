import { NextResponse } from "next/server";
import {
  detachBuyerPaymentMethod,
  setBuyerDefaultPaymentMethod,
} from "@/lib/stripe-customer";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { isStripeConfigured } from "@/lib/stripe";
import { isVenmoWalletPaymentMethodId } from "@/lib/paypal-buyer-venmo";
import { clearBuyerLiveWalletReadinessCache } from "@/lib/buyer-live-wallet-readiness";

type PatchBody = { action?: string };

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveAccountUserId(req, { skipStripeSiblingSync: true });
  if (auth instanceof NextResponse) return auth;

  const { id: raw } = await ctx.params;
  const paymentMethodId = decodeURIComponent(raw).trim();
  const isVenmo = isVenmoWalletPaymentMethodId(paymentMethodId);
  if (!isVenmo && !paymentMethodId.startsWith("pm_")) {
    return NextResponse.json({ error: "Invalid payment method." }, { status: 400 });
  }
  if (!isVenmo && !isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  }

  let body: PatchBody = {};
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    /* empty ok */
  }

  if (body.action !== "set_default") {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  try {
    await setBuyerDefaultPaymentMethod(auth.userId, paymentMethodId);
    clearBuyerLiveWalletReadinessCache(auth.userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "PM_NOT_OWNED" || msg === "PM_NOT_FOUND" || msg === "VENMO_NOT_LINKED") {
      return NextResponse.json({ error: "Payment method not found." }, { status: 404 });
    }
    console.error(e);
    return NextResponse.json({ error: "Could not update default payment method." }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveAccountUserId(req, { skipStripeSiblingSync: true });
  if (auth instanceof NextResponse) return auth;

  const { id: raw } = await ctx.params;
  const paymentMethodId = decodeURIComponent(raw).trim();
  const isVenmo = isVenmoWalletPaymentMethodId(paymentMethodId);
  if (!isVenmo && !paymentMethodId.startsWith("pm_")) {
    return NextResponse.json({ error: "Invalid payment method." }, { status: 400 });
  }
  if (!isVenmo && !isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  }

  try {
    await detachBuyerPaymentMethod(auth.userId, paymentMethodId);
    clearBuyerLiveWalletReadinessCache(auth.userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "PM_NOT_OWNED" || msg === "PM_NOT_FOUND" || msg === "VENMO_NOT_LINKED") {
      return NextResponse.json({ error: "Payment method not found." }, { status: 404 });
    }
    console.error(e);
    return NextResponse.json({ error: "Could not remove payment method." }, { status: 500 });
  }
}
