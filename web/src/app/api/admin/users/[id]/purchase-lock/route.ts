import { NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin/admin-audit";
import { requireAdminPermission } from "@/lib/admin/admin-permissions";
import { AUTO_LOCK_REASON } from "@/lib/buyer-payment-risk";
import { prisma } from "@/lib/prisma";
import { normalizeSellerLockReason } from "@/lib/seller-lock";
import { logTrustModerationAction } from "@/lib/trust/moderation-audit-log";

export const runtime = "nodejs";

type Body = { action?: string; reason?: string };

const lockSelect = { id: true, purchasesLockedAt: true, purchasesLockReason: true } as const;

function decodeId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Buyer purchase lock state (src/lib/buyer-payment-risk.ts) for the admin user page. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminPermission("users.suspend");
  if (!gate.ok) return gate.response;

  const id = decodeId((await ctx.params).id);
  const user = await prisma.user.findUnique({ where: { id }, select: lockSelect });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    locked: user.purchasesLockedAt != null,
    lockedAt: user.purchasesLockedAt?.toISOString() ?? null,
    reason: user.purchasesLockReason,
    automatic: user.purchasesLockReason === AUTO_LOCK_REASON,
  });
}

/** Lock or unlock buying for this account. Requires a written reason; both are audit-logged. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminPermission("users.suspend");
  if (!gate.ok) return gate.response;

  const id = decodeId((await ctx.params).id);
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
  if (id === gate.userId && action === "lock") {
    return NextResponse.json({ error: "You cannot lock your own account." }, { status: 400 });
  }
  const reason = normalizeSellerLockReason(body.reason);
  if (!reason) {
    return NextResponse.json({ error: "A reason of at least 5 characters is required." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id }, select: lockSelect });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const wasLocked = user.purchasesLockedAt != null;

  if (action === "lock" ? wasLocked : !wasLocked) {
    return NextResponse.json({ ok: true, locked: wasLocked, unchanged: true });
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data:
        action === "lock"
          ? { purchasesLockedAt: new Date(), purchasesLockReason: reason }
          : { purchasesLockedAt: null, purchasesLockReason: null },
    });
    await logAdminAction(
      {
        adminUserId: gate.userId,
        action: action === "lock" ? "buyer.purchase_lock" : "buyer.purchase_unlock",
        targetType: "user",
        targetId: id,
        targetUserId: id,
        reason,
        detail: { previousReason: user.purchasesLockReason },
      },
      tx,
    );
  });
  await logTrustModerationAction({
    actorUserId: gate.userId,
    action: action === "lock" ? "admin_buyer_purchases_locked" : "admin_buyer_purchases_unlocked",
    targetType: "user",
    targetId: id,
    detail: { reason, previousReason: user.purchasesLockReason },
  });
  return NextResponse.json({ ok: true, locked: action === "lock" });
}
