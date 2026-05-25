import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { liveTipApplicationFeeCents, resolveLiveTipRecipientUserId } from "@/lib/live-tip-routing";

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
