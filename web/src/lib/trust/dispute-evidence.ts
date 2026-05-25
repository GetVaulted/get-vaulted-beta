import { prisma } from "@/lib/prisma";
import { logTrustModerationAction } from "@/lib/trust/moderation-audit-log";
import { listActiveReplaysForRoom } from "@/lib/trust/live-replay-service";

export type DisputeEvidenceSummary = {
  generatedAt: string;
  order: Record<string, unknown> | null;
  listing: Record<string, unknown> | null;
  buyer: { id: string; username: string; email: string } | null;
  seller: { id: string; username: string; email: string } | null;
  winningBid: Record<string, unknown> | null;
  tracking: Record<string, unknown> | null;
  payout: Record<string, unknown> | null;
  liveReplays: Array<Record<string, unknown>>;
  chatLogs: Array<{ id: string; senderId: string; username: string; body: string; createdAt: string }>;
  relatedReports: Array<{ id: string; reason: string; status: string; createdAt: string }>;
};

export async function generateDisputeEvidenceBundle(args: {
  orderId?: string | null;
  liveRoomId?: string | null;
  reportId?: string | null;
  adminUserId: string;
}): Promise<{ id: string; summary: DisputeEvidenceSummary }> {
  const bundle = await prisma.disputeEvidenceBundle.create({
    data: {
      orderId: args.orderId ?? null,
      liveRoomId: args.liveRoomId ?? null,
      reportId: args.reportId ?? null,
      generatedByAdminId: args.adminUserId,
      status: "pending",
    },
  });

  try {
    const summary = await buildEvidenceSummary(args);
    await prisma.disputeEvidenceBundle.update({
      where: { id: bundle.id },
      data: { status: "ready", summaryJson: summary as object },
    });
    await logTrustModerationAction({
      actorUserId: args.adminUserId,
      action: "dispute_evidence_generated",
      targetType: args.orderId ? "order" : args.liveRoomId ? "live_room" : "report",
      targetId: args.orderId ?? args.liveRoomId ?? args.reportId ?? bundle.id,
      liveRoomId: args.liveRoomId ?? null,
      detail: { bundleId: bundle.id },
    });
    return { id: bundle.id, summary };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Evidence generation failed.";
    await prisma.disputeEvidenceBundle.update({
      where: { id: bundle.id },
      data: { status: "failed", errorMessage: msg },
    });
    throw e;
  }
}

async function buildEvidenceSummary(args: {
  orderId?: string | null;
  liveRoomId?: string | null;
  reportId?: string | null;
}): Promise<DisputeEvidenceSummary> {
  let orderId = args.orderId ?? null;
  let liveRoomId = args.liveRoomId ?? null;

  if (args.reportId) {
    const report = await prisma.report.findUnique({
      where: { id: args.reportId },
      select: { targetType: true, targetId: true, liveRoomId: true },
    });
    if (report?.targetType === "order") orderId = report.targetId;
    if (report?.liveRoomId) liveRoomId = report.liveRoomId;
    if (report?.targetType === "live_room") liveRoomId = report.targetId;
  }

  let order: DisputeEvidenceSummary["order"] = null;
  let listing: DisputeEvidenceSummary["listing"] = null;
  let buyer: DisputeEvidenceSummary["buyer"] = null;
  let seller: DisputeEvidenceSummary["seller"] = null;
  let winningBid: DisputeEvidenceSummary["winningBid"] = null;
  let tracking: DisputeEvidenceSummary["tracking"] = null;
  let payout: DisputeEvidenceSummary["payout"] = null;

  if (orderId) {
    const o = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        buyer: { select: { id: true, username: true, email: true } },
        seller: { select: { id: true, username: true, email: true } },
        listing: {
          select: {
            id: true,
            title: true,
            buyingFormat: true,
            status: true,
            priceUsd: true,
          },
        },
      },
    });
    if (o) {
      order = {
        id: o.id,
        status: o.status,
        paymentStatus: o.paymentStatus,
        itemPriceUsd: o.itemPriceUsd,
        shippingPriceUsd: o.shippingPriceUsd,
        taxUsd: o.taxUsd,
        totalUsd: o.totalUsd,
        createdAt: o.createdAt.toISOString(),
        paymentDeadlineAt: o.paymentDeadlineAt?.toISOString() ?? null,
        deliveryConfirmedAt: o.deliveryConfirmedAt?.toISOString() ?? null,
      };
      listing = o.listing;
      buyer = o.buyer;
      seller = o.seller;
      tracking = {
        trackingNumber: o.trackingNumber,
        labelUrl: o.labelUrl,
        shippedAt: o.shippedAt?.toISOString() ?? null,
        fulfillmentStatus: o.fulfillmentStatus,
      };
      payout = {
        payoutStatus: o.payoutStatus,
        payoutEligibleAt: o.payoutEligibleAt?.toISOString() ?? null,
        payoutBlockedReason: o.payoutBlockedReason,
        payoutMethod: o.payoutMethod,
      };

      const bid = await prisma.bid.findFirst({
        where: { listingId: o.listingId },
        orderBy: { amountUsd: "desc" },
        include: { bidder: { select: { id: true, username: true } } },
      });
      if (bid) {
        winningBid = {
          amountUsd: bid.amountUsd,
          bidderId: bid.bidderId,
          bidderUsername: bid.bidder.username,
          createdAt: bid.createdAt.toISOString(),
        };
      }

      const liveItem = await prisma.liveRoomItem.findFirst({
        where: { listingId: o.listingId },
        select: { liveRoomId: true },
      });
      if (liveItem && !liveRoomId) liveRoomId = liveItem.liveRoomId;
    }
  }

  const liveReplays = liveRoomId ? await listActiveReplaysForRoom(liveRoomId) : [];

  const chatLogs = liveRoomId
    ? (
        await prisma.liveRoomMessage.findMany({
          where: { liveRoomId, messageType: { in: ["chat", "bid", "system", "tip"] } },
          orderBy: { createdAt: "asc" },
          take: 500,
          include: { sender: { select: { username: true } } },
        })
      ).map((m) => ({
        id: m.id,
        senderId: m.senderId,
        username: m.sender.username,
        body: m.deletedAt ? "[deleted]" : m.body,
        createdAt: m.createdAt.toISOString(),
      }))
    : [];

  const orClauses: object[] = [];
  if (orderId) orClauses.push({ targetType: "order" as const, targetId: orderId });
  if (liveRoomId) orClauses.push({ liveRoomId });
  if (args.reportId) orClauses.push({ id: args.reportId });

  const relatedReports =
    orClauses.length > 0
      ? await prisma.report.findMany({
          where: { OR: orClauses },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: { id: true, reason: true, status: true, createdAt: true },
        })
      : [];

  return {
    generatedAt: new Date().toISOString(),
    order,
    listing,
    buyer,
    seller,
    winningBid,
    tracking,
    payout,
    liveReplays,
    chatLogs,
    relatedReports: relatedReports.map((r) => ({
      id: r.id,
      reason: r.reason,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

export async function getDisputeEvidenceBundle(bundleId: string) {
  const row = await prisma.disputeEvidenceBundle.findUnique({ where: { id: bundleId } });
  if (!row) return null;
  return {
    id: row.id,
    orderId: row.orderId,
    liveRoomId: row.liveRoomId,
    reportId: row.reportId,
    status: row.status,
    summaryJson: row.summaryJson,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
