import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type AdminActionInput = {
  adminUserId: string;
  /** Dotted verb, e.g. "refund.approve", "show.move_items", "order.reassign_spot". */
  action: string;
  targetType: "user" | "order" | "live_room" | "refund_request" | "live_item" | "purchase" | string;
  targetId: string;
  /** Buyer/seller affected, so the entry also appears on their profile. */
  targetUserId?: string | null;
  reason?: string;
  detail?: Record<string, unknown> | null;
};

type Db = Pick<typeof prisma, "adminActionLog">;

/**
 * Record an admin change. Pass `tx` to write inside the same transaction as the change itself
 * (preferred for anything that mutates data) so the log and the change commit or fail together.
 */
export async function logAdminAction(input: AdminActionInput, tx?: Db) {
  const db = tx ?? prisma;
  return db.adminActionLog.create({
    data: {
      adminUserId: input.adminUserId,
      action: input.action.slice(0, 80),
      targetType: input.targetType.slice(0, 40),
      targetId: input.targetId,
      targetUserId: input.targetUserId ?? null,
      reason: (input.reason ?? "").trim().slice(0, 1000),
      detail: (input.detail ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

/** Best-effort variant for read-adjacent or already-committed actions: never throws. */
export async function logAdminActionSafe(input: AdminActionInput) {
  try {
    await logAdminAction(input);
  } catch (e) {
    console.error("[admin-audit] failed to write AdminActionLog", e);
  }
}

export const ADMIN_REASON_MIN_LENGTH = 5;

/** Returns a trimmed reason or null if it is too short to be useful. */
export function normalizeAdminReason(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t.length >= ADMIN_REASON_MIN_LENGTH ? t.slice(0, 1000) : null;
}
