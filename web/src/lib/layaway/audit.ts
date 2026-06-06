import type { Prisma } from "@/generated/prisma/client";

export type LayawayAuditAction =
  | "deposit_received"
  | "payment_received"
  | "refund_issued"
  | "default"
  | "completion";

export async function logLayawayAudit(
  tx: Prisma.TransactionClient,
  args: {
    layawayId: string;
    action: LayawayAuditAction;
    actorUserId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.layawayAuditLog.create({
    data: {
      layawayId: args.layawayId,
      action: args.action,
      actorUserId: args.actorUserId ?? null,
      metadata: (args.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
