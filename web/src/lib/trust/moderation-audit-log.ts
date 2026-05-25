import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/** Best-effort cross-domain trust & safety audit log. */
export async function logTrustModerationAction(args: {
  actorUserId: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  liveRoomId?: string | null;
  detail?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await prisma.trustModerationAuditLog.create({
      data: {
        actorUserId: args.actorUserId,
        action: args.action,
        targetType: args.targetType ?? null,
        targetId: args.targetId ?? null,
        liveRoomId: args.liveRoomId ?? null,
        detail: args.detail ? (args.detail as Prisma.InputJsonValue) : undefined,
      },
    });
  } catch (e) {
    console.error("[trust audit] failed to write TrustModerationAuditLog", e);
  }
}

export async function logReportAudit(args: {
  reportId: string;
  actorUserId: string;
  action: string;
  detail?: string | null;
}): Promise<void> {
  await prisma.reportAuditLog.create({
    data: {
      reportId: args.reportId,
      actorUserId: args.actorUserId,
      action: args.action,
      detail: args.detail ?? null,
    },
  });
}
