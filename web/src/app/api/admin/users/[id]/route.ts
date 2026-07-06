import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { endLiveRoomsForSuspendedSeller } from "@/lib/seller-suspension-live-guard";
import { logTrustModerationAction } from "@/lib/trust/moderation-audit-log";

type Body = { action?: string; reason?: string };

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 2000) : "";

  if (id === gate.userId) {
    return NextResponse.json({ error: "You cannot change your own account here." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "suspend") {
    await prisma.user.update({
      where: { id },
      data: { suspendedAt: new Date() },
    });
    // Chaos engineering deep-dive (2026-07): suspension previously only blocked the host console —
    // an already-live room stayed live, and bids/buy-now kept working against a suspended seller.
    // Force-end any live/scheduled rooms the same safe way the manual admin "end show" action does.
    const liveShowResult = await endLiveRoomsForSuspendedSeller(id).catch((e) => {
      console.error("[admin suspend] failed to end live rooms for suspended seller", id, e);
      return { ended: 0, cancelled: 0 };
    });
    await logTrustModerationAction({
      actorUserId: gate.userId,
      action: "admin_user_suspended",
      targetType: "user",
      targetId: id,
      detail: {
        reason: reason || null,
        liveShowsEnded: liveShowResult.ended,
        liveShowsCancelled: liveShowResult.cancelled,
      },
    });
    return NextResponse.json({ ok: true, liveShowsEnded: liveShowResult.ended, liveShowsCancelled: liveShowResult.cancelled });
  }
  if (action === "unsuspend") {
    await prisma.user.update({
      where: { id },
      data: { suspendedAt: null },
    });
    await logTrustModerationAction({
      actorUserId: gate.userId,
      action: "admin_user_unsuspended",
      targetType: "user",
      targetId: id,
      detail: { reason: reason || null },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action." }, { status: 400 });
}
