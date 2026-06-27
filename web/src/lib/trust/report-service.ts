import type { ReportStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { emitLiveRoomModerationChanged } from "@/lib/realtime-emit-server";
import { logReportAudit } from "@/lib/trust/moderation-audit-log";
import type { CreateReportInput } from "@/lib/trust/report-types";
import { isReportReason, isReportTargetType } from "@/lib/trust/report-types";

export async function validateReportTarget(args: {
  targetType: CreateReportInput["targetType"];
  targetId: string;
}): Promise<{ ok: true; liveRoomId?: string | null } | { ok: false; error: string }> {
  const { targetType, targetId } = args;
  switch (targetType) {
    case "user": {
      const u = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
      return u ? { ok: true } : { ok: false, error: "User not found." };
    }
    case "listing": {
      const l = await prisma.listing.findUnique({ where: { id: targetId }, select: { id: true } });
      return l ? { ok: true } : { ok: false, error: "Listing not found." };
    }
    case "live_room": {
      const r = await prisma.liveRoom.findUnique({ where: { id: targetId }, select: { id: true } });
      return r ? { ok: true, liveRoomId: targetId } : { ok: false, error: "Live room not found." };
    }
    case "message": {
      const m = await prisma.liveRoomMessage.findUnique({
        where: { id: targetId },
        select: { id: true, liveRoomId: true },
      });
      return m ? { ok: true, liveRoomId: m.liveRoomId } : { ok: false, error: "Message not found." };
    }
    case "order": {
      const o = await prisma.order.findUnique({ where: { id: targetId }, select: { id: true } });
      return o ? { ok: true } : { ok: false, error: "Order not found." };
    }
    case "break": {
      const b = await prisma.breakSpot.findUnique({
        where: { id: targetId },
        select: { id: true, liveRoomId: true },
      });
      return b ? { ok: true, liveRoomId: b.liveRoomId } : { ok: false, error: "Break spot not found." };
    }
    default:
      return { ok: false, error: "Invalid target type." };
  }
}

export async function createReport(input: CreateReportInput) {
  if (!isReportTargetType(input.targetType)) throw new Error("INVALID_TARGET_TYPE");
  if (!isReportReason(input.reason)) throw new Error("INVALID_REASON");

  const targetCheck = await validateReportTarget({
    targetType: input.targetType,
    targetId: input.targetId.trim(),
  });
  if (!targetCheck.ok) throw new Error(targetCheck.error);

  const description = (input.description ?? "").trim().slice(0, 4000);
  const liveRoomId = input.liveRoomId?.trim() || targetCheck.liveRoomId || null;

  const report = await prisma.report.create({
    data: {
      reporterUserId: input.reporterUserId,
      targetType: input.targetType,
      targetId: input.targetId.trim(),
      reason: input.reason,
      description,
      liveRoomId,
    },
  });

  await logReportAudit({
    reportId: report.id,
    actorUserId: input.reporterUserId,
    action: "created",
    detail: `${input.targetType}:${input.targetId}`,
  });

  if (liveRoomId) {
    emitLiveRoomModerationChanged(liveRoomId);
  }

  return report;
}

export async function adminUpdateReport(args: {
  reportId: string;
  adminUserId: string;
  action: "assign" | "reviewing" | "resolve" | "dismiss" | "note";
  assignedAdminId?: string | null;
  moderationNotes?: string;
}) {
  const row = await prisma.report.findUnique({ where: { id: args.reportId } });
  if (!row) throw new Error("NOT_FOUND");

  const data: {
    status?: ReportStatus;
    assignedAdminId?: string | null;
    moderationNotes?: string;
    resolvedAt?: Date | null;
  } = {};

  if (args.action === "assign" && args.assignedAdminId) {
    data.assignedAdminId = args.assignedAdminId;
    data.status = "reviewing";
    await logReportAudit({
      reportId: args.reportId,
      actorUserId: args.adminUserId,
      action: "assigned",
      detail: args.assignedAdminId,
    });
  } else if (args.action === "reviewing") {
    data.status = "reviewing";
    await logReportAudit({ reportId: args.reportId, actorUserId: args.adminUserId, action: "reviewing" });
  } else if (args.action === "resolve") {
    data.status = "resolved";
    data.resolvedAt = new Date();
    await logReportAudit({ reportId: args.reportId, actorUserId: args.adminUserId, action: "resolved" });
  } else if (args.action === "dismiss") {
    data.status = "dismissed";
    data.resolvedAt = new Date();
    await logReportAudit({ reportId: args.reportId, actorUserId: args.adminUserId, action: "dismissed" });
  } else if (args.action === "note" && typeof args.moderationNotes === "string") {
    data.moderationNotes = args.moderationNotes.trim().slice(0, 8000);
    await logReportAudit({
      reportId: args.reportId,
      actorUserId: args.adminUserId,
      action: "note_updated",
    });
  }

  return prisma.report.update({
    where: { id: args.reportId },
    data,
  });
}

export function serializeReport(row: {
  id: string;
  reporterUserId: string;
  targetType: string;
  targetId: string;
  reason: string;
  description: string;
  status: string;
  assignedAdminId: string | null;
  moderationNotes: string;
  liveRoomId: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  reporter?: { id: string; username: string } | null;
  assignedAdmin?: { id: string; username: string } | null;
}) {
  return {
    id: row.id,
    reporterUserId: row.reporterUserId,
    targetType: row.targetType,
    targetId: row.targetId,
    reason: row.reason,
    description: row.description,
    status: row.status,
    assignedAdminId: row.assignedAdminId,
    moderationNotes: row.moderationNotes,
    liveRoomId: row.liveRoomId,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    reporter: row.reporter ?? null,
    assignedAdmin: row.assignedAdmin ?? null,
  };
}
