import { NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin/admin-audit";
import { requireAdminPermission } from "@/lib/admin/admin-permissions";
import { prisma } from "@/lib/prisma";
import { normalizeSellerLockReason, sellerLockFromRow } from "@/lib/seller-lock";
import { ensureSellerStripeManualPayouts } from "@/lib/seller-stripe-connect";
import { endLiveRoomsForSuspendedSeller } from "@/lib/seller-suspension-live-guard";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { logTrustModerationAction } from "@/lib/trust/moderation-audit-log";

export const runtime = "nodejs";

type Body = { action?: string; reason?: string };

const lockSelect = {
  id: true,
  username: true,
  sellerLockedAt: true,
  sellerLockReason: true,
  sellerLockedById: true,
  stripeAccountId: true,
} as const;

function decodeId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Current lock state for the admin panel. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminPermission("users.suspend");
  if (!gate.ok) return gate.response;

  const { id: raw } = await ctx.params;
  const id = decodeId(raw);
  const user = await prisma.user.findUnique({ where: { id }, select: lockSelect });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const lock = sellerLockFromRow(user);
  const lockedBy = lock.lockedById
    ? await prisma.user.findUnique({ where: { id: lock.lockedById }, select: { username: true } }).catch(() => null)
    : null;

  return NextResponse.json({
    userId: user.id,
    username: user.username,
    locked: lock.locked,
    lockedAt: lock.lockedAt?.toISOString() ?? null,
    reason: lock.reason,
    lockedByUsername: lockedBy?.username ?? null,
  });
}

/**
 * Apply or lift the targeted seller lock.
 *  - `lock`: sets the flag, ends any live/scheduled show, and (best effort) confirms the seller's Stripe Connect
 *    payout schedule is manual so Stripe cannot auto-pay them outside our payout code.
 *  - `unlock`: clears the flag. Orders and balances were never touched, so the normal payout flow resumes.
 * Both require a written reason and are recorded in the admin audit log.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminPermission("users.suspend");
  if (!gate.ok) return gate.response;

  const { id: raw } = await ctx.params;
  const id = decodeId(raw);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action.trim() : "";
  if (action !== "lock" && action !== "unlock") {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }
  if (id === gate.userId) {
    return NextResponse.json({ error: "You cannot lock your own account." }, { status: 400 });
  }
  const reason = normalizeSellerLockReason(body.reason);
  if (!reason) {
    return NextResponse.json({ error: "A reason of at least 5 characters is required." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id }, select: lockSelect });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const current = sellerLockFromRow(user);

  if (action === "lock") {
    if (!current.locked) {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id },
          data: { sellerLockedAt: new Date(), sellerLockReason: reason, sellerLockedById: gate.userId },
        });
        await logAdminAction(
          {
            adminUserId: gate.userId,
            action: "seller.lock",
            targetType: "user",
            targetId: id,
            targetUserId: id,
            reason,
            detail: { blocks: ["go_live", "payouts"] },
          },
          tx,
        );
      });
    }

    // Same safe teardown the admin suspend action uses: stops new bids/buy-now on a show already running.
    const liveShows = await endLiveRoomsForSuspendedSeller(id).catch((e) => {
      console.error("[seller-lock] failed to end live rooms", id, e);
      return { ended: 0, cancelled: 0 };
    });

    // Belt and braces: a Connect account on an automatic payout schedule would be paid by Stripe itself,
    // bypassing every check in our payout code. Platform accounts are created manual; confirm this one is.
    let stripePayoutScheduleManual: boolean | null = null;
    const accountId = user.stripeAccountId?.trim();
    if (accountId && isStripeConfigured()) {
      try {
        await ensureSellerStripeManualPayouts(getStripe(), accountId);
        stripePayoutScheduleManual = true;
      } catch (e) {
        console.error("[seller-lock] could not confirm manual Stripe payout schedule", id, e);
        stripePayoutScheduleManual = false;
      }
    }

    await logTrustModerationAction({
      actorUserId: gate.userId,
      action: "admin_seller_locked",
      targetType: "user",
      targetId: id,
      detail: {
        reason,
        liveShowsEnded: liveShows.ended,
        liveShowsCancelled: liveShows.cancelled,
        stripePayoutScheduleManual,
      },
    });

    return NextResponse.json({
      ok: true,
      locked: true,
      alreadyLocked: current.locked,
      liveShowsEnded: liveShows.ended,
      liveShowsCancelled: liveShows.cancelled,
      stripePayoutScheduleManual,
    });
  }

  // unlock
  if (current.locked) {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { sellerLockedAt: null, sellerLockReason: null, sellerLockedById: null },
      });
      await logAdminAction(
        {
          adminUserId: gate.userId,
          action: "seller.unlock",
          targetType: "user",
          targetId: id,
          targetUserId: id,
          reason,
          detail: { lockedAt: current.lockedAt?.toISOString() ?? null, previousReason: current.reason },
        },
        tx,
      );
    });
    await logTrustModerationAction({
      actorUserId: gate.userId,
      action: "admin_seller_unlocked",
      targetType: "user",
      targetId: id,
      detail: { reason, previousReason: current.reason },
    });
  }
  return NextResponse.json({ ok: true, locked: false, alreadyUnlocked: !current.locked });
}
