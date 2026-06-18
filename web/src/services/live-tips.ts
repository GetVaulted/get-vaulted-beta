import { getStripe, getStripePublishableKey, isStripeConfigured } from "@/lib/stripe";
import { stripeCheckoutSessionPaymentOptions } from "@/lib/stripe-payment-method-config";
import { prisma } from "@/lib/prisma";
import { liveTipApplicationFeeCents, resolveLiveTipRecipientUserId } from "@/lib/live-tip-routing";
import { assertPaymentMethodOwnedByUser, getBuyerDefaultCardPaymentMethodId } from "@/lib/stripe-customer";
import { isStripePaymentMethodId } from "@/lib/stripe-payment-method-id";
import { liveWalletIncompleteOrNull } from "@/lib/buyer-live-wallet-readiness";
import Stripe from "stripe";

const PAYMENT_PENDING = "pending_payment";
const PAYMENT_PAID = "paid";
const PAYMENT_FAILED = "failed";

function siteUrl(): string {
  const u = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return u.replace(/\/$/, "");
}

export const LIVE_TIP_MIN_USD = 1;
export const LIVE_TIP_MAX_USD = 500;

function clampTipAmountUsd(raw: number): number | null {
  if (!Number.isFinite(raw)) return null;
  const v = Math.round(raw * 100) / 100;
  if (v < LIVE_TIP_MIN_USD || v > LIVE_TIP_MAX_USD) return null;
  return v;
}

export async function createLiveTipCheckoutSession(args: {
  userId: string;
  liveRoomId: string;
  amountUsd: number;
  message?: string;
  successPath?: string;
  cancelPath?: string;
}): Promise<{ url: string; liveTipId: string }> {
  if (!isStripeConfigured()) throw new Error("STRIPE_NOT_CONFIGURED");

  const amountUsd = clampTipAmountUsd(args.amountUsd);
  if (amountUsd == null) {
    throw new Error(`Tip amount must be between $${LIVE_TIP_MIN_USD} and $${LIVE_TIP_MAX_USD}.`);
  }

  const room = await prisma.liveRoom.findUnique({
    where: { id: args.liveRoomId },
    select: {
      id: true,
      sellerId: true,
      status: true,
      title: true,
      tipRecipientMode: true,
      tipModeratorId: true,
    },
  });
  if (!room) throw new Error("ROOM_NOT_FOUND");
  if (room.status !== "live") throw new Error("ROOM_NOT_LIVE");

  const recipientUserId = resolveLiveTipRecipientUserId(room);
  const recipient = await prisma.user.findUnique({
    where: { id: recipientUserId },
    select: { id: true, username: true, stripeAccountId: true, stripeOnboardingComplete: true },
  });
  if (!recipient?.stripeAccountId?.trim() || !recipient.stripeOnboardingComplete) {
    throw new Error("TIP_RECIPIENT_NOT_READY");
  }

  const message = (args.message ?? "").trim().slice(0, 280);
  const tip = await prisma.liveTip.create({
    data: {
      liveRoomId: room.id,
      senderId: args.userId,
      recipientId: recipientUserId,
      amountUsd,
      message,
      status: "pending",
    },
  });

  const stripe = getStripe();
  const base = siteUrl();
  const feeCents = liveTipApplicationFeeCents();

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        ...stripeCheckoutSessionPaymentOptions("live"),
        success_url: `${base}${args.successPath ?? `/live/${encodeURIComponent(room.id)}`}?tip=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}${args.cancelPath ?? `/live/${encodeURIComponent(room.id)}`}?tip=cancelled`,
        metadata: {
          kind: "live_tip",
          liveTipId: tip.id,
          liveRoomId: room.id,
          senderId: args.userId,
          recipientId: recipientUserId,
        },
        payment_intent_data: {
          application_fee_amount: feeCents,
          transfer_data: { destination: recipient.stripeAccountId! },
          metadata: {
            kind: "live_tip",
            liveTipId: tip.id,
            liveRoomId: room.id,
            recipientId: recipientUserId,
          },
        },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: Math.round(amountUsd * 100),
              product_data: {
                name: `Tip for ${room.title}`.slice(0, 120),
                description: `Live tip to @${recipient.username}`,
              },
            },
          },
        ],
      },
      { idempotencyKey: `live_tip_${tip.id}` },
    );

    if (!session.url) throw new Error("NO_CHECKOUT_URL");

    await prisma.liveTip.update({
      where: { id: tip.id },
      data: { stripeCheckoutSessionId: session.id },
    });

    return { url: session.url, liveTipId: tip.id };
  } catch (e) {
    await prisma.liveTip.updateMany({
      where: { id: tip.id, status: "pending" },
      data: { status: "failed" },
    });
    throw e;
  }
}

export type LiveTipChargeOutcome =
  | { outcome: "paid"; liveTipId: string; paymentIntentId: string }
  | {
      outcome: "requires_action";
      liveTipId: string;
      paymentIntentId: string;
      clientSecret: string;
      publishableKey: string;
    }
  | { outcome: "error"; code: string; message: string };

async function resolveTipPaymentMethodId(
  userId: string,
  paymentMethodId?: string | null,
): Promise<string | null> {
  const explicit = paymentMethodId?.trim() ?? "";
  if (isStripePaymentMethodId(explicit)) {
    await assertPaymentMethodOwnedByUser(userId, explicit);
    return explicit;
  }
  return getBuyerDefaultCardPaymentMethodId(userId);
}

function mapTipPaymentIntentOutcome(
  pi: Stripe.PaymentIntent,
): { kind: "paid"; paymentIntentId: string } | { kind: "requires_action"; paymentIntentId: string; clientSecret: string } | null {
  if (pi.status === "succeeded") {
    return { kind: "paid", paymentIntentId: pi.id };
  }
  if (pi.status === "requires_action" || pi.status === "requires_confirmation") {
    const clientSecret = pi.client_secret;
    if (!clientSecret) return null;
    return { kind: "requires_action", paymentIntentId: pi.id, clientSecret };
  }
  return null;
}

/** Charge a live tip with the buyer's saved Wallet card (same pipeline as bids / spot buys). */
export async function chargeLiveTipWithSavedPaymentMethod(args: {
  userId: string;
  liveRoomId: string;
  amountUsd: number;
  message?: string;
  paymentMethodId?: string | null;
}): Promise<LiveTipChargeOutcome> {
  if (!isStripeConfigured()) {
    return { outcome: "error", code: "STRIPE_NOT_CONFIGURED", message: "Tips are unavailable on this server." };
  }

  const wallet = await liveWalletIncompleteOrNull(args.userId);
  if (wallet) {
    return {
      outcome: "error",
      code: wallet.code,
      message: wallet.error,
    };
  }

  const amountUsd = clampTipAmountUsd(args.amountUsd);
  if (amountUsd == null) {
    return {
      outcome: "error",
      code: "INVALID_AMOUNT",
      message: `Tip amount must be between $${LIVE_TIP_MIN_USD} and $${LIVE_TIP_MAX_USD}.`,
    };
  }

  const room = await prisma.liveRoom.findUnique({
    where: { id: args.liveRoomId },
    select: {
      id: true,
      sellerId: true,
      status: true,
      title: true,
      tipRecipientMode: true,
      tipModeratorId: true,
    },
  });
  if (!room) return { outcome: "error", code: "ROOM_NOT_FOUND", message: "Room not found." };
  if (room.status !== "live") {
    return { outcome: "error", code: "ROOM_NOT_LIVE", message: "Tips are only available while the show is live." };
  }
  if (room.sellerId === args.userId) {
    return { outcome: "error", code: "HOST_CANNOT_TIP", message: "You cannot tip during your own show." };
  }

  const recipientUserId = resolveLiveTipRecipientUserId(room);
  const recipient = await prisma.user.findUnique({
    where: { id: recipientUserId },
    select: { id: true, username: true, stripeAccountId: true, stripeOnboardingComplete: true },
  });
  if (!recipient?.stripeAccountId?.trim() || !recipient.stripeOnboardingComplete) {
    return {
      outcome: "error",
      code: "TIP_RECIPIENT_NOT_READY",
      message: "The tip recipient has not finished payout setup yet.",
    };
  }

  let pmId: string | null;
  try {
    pmId = await resolveTipPaymentMethodId(args.userId, args.paymentMethodId);
  } catch {
    return { outcome: "error", code: "PM_VALIDATION_FAILED", message: "Could not use that payment method." };
  }
  if (!pmId) {
    return {
      outcome: "error",
      code: "NO_SAVED_CARD",
      message: "Add a saved payment method in Vault Wallet before tipping.",
    };
  }

  const buyer = await prisma.user.findUnique({
    where: { id: args.userId },
    select: { stripeCustomerId: true },
  });
  const customerId = buyer?.stripeCustomerId?.trim();
  if (!customerId) {
    return { outcome: "error", code: "BUYER_STRIPE_CUSTOMER_MISSING", message: "Wallet is not linked to Stripe." };
  }

  const message = (args.message ?? "").trim().slice(0, 280);
  const tip = await prisma.liveTip.create({
    data: {
      liveRoomId: room.id,
      senderId: args.userId,
      recipientId: recipientUserId,
      amountUsd,
      message,
      status: "pending",
    },
  });

  const amountCents = Math.round(amountUsd * 100);
  const feeCents = liveTipApplicationFeeCents();
  const stripe = getStripe();
  const publishableKey = getStripePublishableKey().trim();

  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: "usd",
        customer: customerId,
        payment_method: pmId,
        confirmation_method: "automatic",
        confirm: true,
        off_session: true,
        metadata: {
          kind: "live_tip_saved_pm",
          liveTipId: tip.id,
          liveRoomId: room.id,
          senderId: args.userId,
          recipientId: recipientUserId,
        },
        description: `Live tip for ${room.title}`.slice(0, 120),
        application_fee_amount: feeCents,
        transfer_data: { destination: recipient.stripeAccountId! },
      },
      { idempotencyKey: `live_tip_saved_pm_${tip.id}_${amountCents}` },
    );

    await prisma.liveTip.update({
      where: { id: tip.id },
      data: { stripePaymentIntentId: intent.id },
    });

    const mapped = mapTipPaymentIntentOutcome(intent);
    if (mapped?.kind === "paid") {
      await finalizeLiveTipPaid({
        liveTipId: tip.id,
        paymentIntentId: mapped.paymentIntentId,
        checkoutSessionId: null,
      });
      return { outcome: "paid", liveTipId: tip.id, paymentIntentId: mapped.paymentIntentId };
    }
    if (mapped?.kind === "requires_action") {
      return {
        outcome: "requires_action",
        liveTipId: tip.id,
        paymentIntentId: mapped.paymentIntentId,
        clientSecret: mapped.clientSecret,
        publishableKey,
      };
    }

    await prisma.liveTip.updateMany({
      where: { id: tip.id, status: "pending" },
      data: { status: "failed" },
    });
    return { outcome: "error", code: "PAYMENT_INTENT_NOT_COMPLETED", message: "Payment did not complete." };
  } catch (e) {
    await prisma.liveTip.updateMany({
      where: { id: tip.id, status: "pending" },
      data: { status: "failed" },
    });
    if (e instanceof Stripe.errors.StripeCardError) {
      return { outcome: "error", code: "CARD_DECLINED", message: e.message || "Card declined." };
    }
    return { outcome: "error", code: "STRIPE_ERROR", message: "Could not process tip." };
  }
}

export async function finalizeLiveTipPaid(args: {
  liveTipId: string;
  paymentIntentId: string | null;
  checkoutSessionId: string | null;
}): Promise<void> {
  const tip = await prisma.liveTip.findUnique({
    where: { id: args.liveTipId },
    select: {
      id: true,
      liveRoomId: true,
      senderId: true,
      recipientId: true,
      amountUsd: true,
      message: true,
      status: true,
      sender: { select: { username: true } },
      recipient: { select: { username: true } },
    },
  });
  if (!tip || tip.status === "paid") return;

  await prisma.$transaction(async (tx) => {
    await tx.liveTip.update({
      where: { id: tip.id },
      data: {
        status: "paid",
        paidAt: new Date(),
        stripePaymentIntentId: args.paymentIntentId ?? undefined,
        stripeCheckoutSessionId: args.checkoutSessionId ?? undefined,
      },
    });

    const body = tip.message.trim()
      ? `${tip.sender.username} tipped $${tip.amountUsd.toFixed(2)} to @${tip.recipient.username}: ${tip.message}`
      : `${tip.sender.username} tipped $${tip.amountUsd.toFixed(2)} to @${tip.recipient.username}`;

    await tx.liveRoomMessage.create({
      data: {
        liveRoomId: tip.liveRoomId,
        senderId: tip.senderId,
        body: body.slice(0, 2000),
        messageType: "tip",
      },
    });

    await tx.liveRoom.update({
      where: { id: tip.liveRoomId },
      data: { roomVersion: { increment: 1 } },
    });
  });
}

export async function markLiveTipCheckoutFailed(liveTipId: string): Promise<void> {
  await prisma.liveTip.updateMany({
    where: { id: liveTipId, status: "pending" },
    data: { status: "failed", stripeCheckoutSessionId: null },
  });
}

export { PAYMENT_PENDING, PAYMENT_PAID, PAYMENT_FAILED };
