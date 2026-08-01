import { NextResponse } from "next/server";
import { emitAuctionEnded, emitLiveDiscoveryChanged } from "@/lib/realtime-emit-server";
import { finalizeLiveStreamReplay } from "@/lib/trust/live-replay-service";
import { endHostStageSession } from "@/services/ivs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { liveShowEndGmvFields } from "@/lib/live-show-gmv";
import { logTrustModerationAction } from "@/lib/trust/moderation-audit-log";

type Body = { action?: string; note?: string };

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action.trim() : "";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : "";

  const room = await prisma.liveRoom.findUnique({
    where: { id },
    select: { id: true, status: true, sellerId: true, title: true, completedSalesGmvUsd: true },
  });
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  if (action === "end") {
    if (room.status !== "live") {
      return NextResponse.json({ error: "Room is not live." }, { status: 409 });
    }
    const ended = await prisma.liveRoom.updateMany({
      where: { id, status: "live" },
      data: {
        status: "ended",
        endedAt: new Date(),
        viewerCount: 0,
        viewerCountUpdatedAt: new Date(),
        ...liveShowEndGmvFields(room.completedSalesGmvUsd),
        roomVersion: { increment: 1 },
      },
    });
    if (ended.count === 0) {
      return NextResponse.json({ error: "Room state changed. Refresh and try again." }, { status: 409 });
    }
    const roomNow = await prisma.liveRoom.findUnique({ where: { id }, select: { roomVersion: true } });
    emitAuctionEnded(id, roomNow?.roomVersion);
    emitLiveDiscoveryChanged({ roomId: id, status: "ended", reason: "ended" });
    void endHostStageSession(id).catch((e) => console.error("[admin live end] stage teardown", e));
    void finalizeLiveStreamReplay(id).catch((e) => console.error("[admin live end] replay", e));
    await logTrustModerationAction({
      actorUserId: gate.userId,
      action: "admin_live_show_ended",
      targetType: "live_room",
      targetId: id,
      liveRoomId: id,
      detail: { note: note || null },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "cancel") {
    if (room.status === "ended") return NextResponse.json({ ok: true });
    const ended = await prisma.liveRoom.updateMany({
      where: { id, status: { in: ["scheduled", "live"] } },
      data: {
        status: "ended",
        endedAt: new Date(),
        viewerCount: 0,
        viewerCountUpdatedAt: new Date(),
        ...liveShowEndGmvFields(room.completedSalesGmvUsd),
        roomVersion: { increment: 1 },
      },
    });
    if (ended.count === 0) {
      return NextResponse.json({ error: "Room state changed. Refresh and try again." }, { status: 409 });
    }
    const roomNow = await prisma.liveRoom.findUnique({ where: { id }, select: { roomVersion: true } });
    if (room.status === "live") {
      emitAuctionEnded(id, roomNow?.roomVersion);
    }
    emitLiveDiscoveryChanged({ roomId: id, status: "ended", reason: "cancelled" });
    void endHostStageSession(id).catch((e) => console.error("[admin live cancel] stage teardown", e));
    void finalizeLiveStreamReplay(id).catch((e) => console.error("[admin live cancel] replay", e));
    await logTrustModerationAction({
      actorUserId: gate.userId,
      action: "admin_live_show_cancelled",
      targetType: "live_room",
      targetId: id,
      liveRoomId: id,
      detail: { note: note || null },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "flag") {
    const existing = await prisma.report.findFirst({
      where: {
        targetType: "live_room",
        targetId: id,
        status: { in: ["open", "reviewing"] },
      },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ ok: true, reportId: existing.id, alreadyFlagged: true });
    }
    const report = await prisma.report.create({
      data: {
        reporterUserId: gate.userId,
        targetType: "live_room",
        targetId: id,
        liveRoomId: id,
        reason: "seller_misconduct",
        description: note || `Admin problem flag — ${room.title}`,
        status: "open",
        assignedAdminId: gate.userId,
        moderationNotes: note || "Flagged from admin command center.",
      },
      select: { id: true },
    });
    return NextResponse.json({ ok: true, reportId: report.id });
  }

  return NextResponse.json({ error: "Unknown action. Use end, cancel, or flag." }, { status: 400 });
}
