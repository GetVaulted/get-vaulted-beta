import type { LiveTipStatus, TipRecipientMode } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type LiveRoomTipLedgerRow = {
  id: string;
  amountUsd: number;
  message: string;
  status: LiveTipStatus;
  senderId: string;
  senderUsername: string;
  recipientId: string;
  recipientUsername: string;
  paidAt: string | null;
  createdAt: string;
};

export type LiveRoomTipLedgerSummary = {
  totalPaidUsd: number;
  paidCount: number;
  pendingCount: number;
  failedCount: number;
  tipRecipientMode: TipRecipientMode;
  tipsToModerator: boolean;
  tipModeratorUsername: string | null;
};

export async function listLiveRoomTipLedger(liveRoomId: string): Promise<{
  tips: LiveRoomTipLedgerRow[];
  summary: LiveRoomTipLedgerSummary;
}> {
  const [room, tips, statusGroups] = await Promise.all([
    prisma.liveRoom.findUnique({
      where: { id: liveRoomId },
      select: {
        tipRecipientMode: true,
        tipModeratorId: true,
        tipModerator: { select: { username: true } },
      },
    }),
    prisma.liveTip.findMany({
      where: { liveRoomId },
      orderBy: { createdAt: "desc" },
      take: 80,
      include: {
        sender: { select: { id: true, username: true } },
        recipient: { select: { id: true, username: true } },
      },
    }),
    prisma.liveTip.groupBy({
      by: ["status"],
      where: { liveRoomId },
      _sum: { amountUsd: true },
      _count: { _all: true },
    }),
  ]);

  const tipRecipientMode = room?.tipRecipientMode ?? "host";
  const tipsToModerator = tipRecipientMode === "moderator" && Boolean(room?.tipModeratorId);

  let totalPaidUsd = 0;
  let paidCount = 0;
  let pendingCount = 0;
  let failedCount = 0;
  for (const g of statusGroups) {
    const count = g._count._all;
    const sum = g._sum.amountUsd ?? 0;
    if (g.status === "paid") {
      paidCount = count;
      totalPaidUsd = sum;
    } else if (g.status === "pending") {
      pendingCount = count;
    } else if (g.status === "failed") {
      failedCount = count;
    }
  }

  return {
    tips: tips.map((t) => ({
      id: t.id,
      amountUsd: t.amountUsd,
      message: t.message,
      status: t.status,
      senderId: t.sender.id,
      senderUsername: t.sender.username,
      recipientId: t.recipient.id,
      recipientUsername: t.recipient.username,
      paidAt: t.paidAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
    })),
    summary: {
      totalPaidUsd,
      paidCount,
      pendingCount,
      failedCount,
      tipRecipientMode,
      tipsToModerator,
      tipModeratorUsername: room?.tipModerator?.username ?? null,
    },
  };
}
