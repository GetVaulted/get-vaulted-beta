import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { reportCronAnomaly } from "@/lib/cron-anomaly-alert";

/**
 * Chaos engineering deep-dive (2026-07): pure `roomType: "auction"` lots deliberately do NOT
 * auto-settle on timer — this is a documented product rule (`LIVE_AUCTION_E2E_QA.md`), not a bug:
 * the host must personally confirm/mark sold (unlike blind-box breaks). Auto-charging the winner
 * on a timeout would be a business-policy change with real financial risk (charging a buyer for an
 * item the seller never confirmed selling), so it is intentionally NOT implemented here.
 *
 * The actual resilience gap is operational, not financial: if the host disconnects and never
 * returns, the winning bidder is stranded indefinitely with no visibility and nobody is ever
 * alerted. This module only adds visibility — it never touches `lastHighBidderId`, bidding state,
 * or money, so auction outcomes cannot be changed by it, correctly or incorrectly.
 */

const STALL_ALERT_SOURCE = "live-auction-stall-alert";

export type StalledAuctionLot = {
  liveRoomId: string;
  liveRoomItemId: string;
  title: string;
  sellerId: string;
  winnerId: string;
  auctionEndsAt: Date;
  hoursSinceTimerEnded: number;
};

export async function findStalledPendingWinnerAuctionLots(thresholdHours = 24): Promise<StalledAuctionLot[]> {
  const cutoff = new Date(Date.now() - thresholdHours * 60 * 60 * 1000);
  const now = Date.now();
  const lots = await prisma.liveRoomItem.findMany({
    where: {
      status: "active",
      biddingOpen: false,
      lastHighBidderId: { not: null },
      auctionEndsAt: { not: null, lte: cutoff },
      liveRoom: { roomType: "auction" },
    },
    select: {
      id: true,
      title: true,
      lastHighBidderId: true,
      auctionEndsAt: true,
      liveRoomId: true,
      liveRoom: { select: { sellerId: true } },
    },
    take: 200,
  });
  return lots
    .filter((l) => l.lastHighBidderId && l.auctionEndsAt)
    .map((l) => ({
      liveRoomId: l.liveRoomId,
      liveRoomItemId: l.id,
      title: l.title,
      sellerId: l.liveRoom.sellerId,
      winnerId: l.lastHighBidderId as string,
      auctionEndsAt: l.auctionEndsAt as Date,
      hoursSinceTimerEnded: (now - (l.auctionEndsAt as Date).getTime()) / (60 * 60 * 1000),
    }));
}

/**
 * Alert admin (Sentry) and the winning buyer, once per lot, when a pure-auction lot has had a
 * locked-in winner for longer than `thresholdHours` with no host "mark sold" action. Read-only with
 * respect to auction/bid/order state — this can only ever add a notification + a Sentry warning,
 * never change who won or what they owe. Safe to rerun on any schedule (dedupe via `WebhookEventLog`
 * so each lot is only alerted once).
 */
export async function reportStalledAuctionLotsToAdmin(
  thresholdHours = 24,
): Promise<{ checked: number; newlyAlerted: number }> {
  const lots = await findStalledPendingWinnerAuctionLots(thresholdHours);
  let newlyAlerted = 0;

  for (const lot of lots) {
    const already = await prisma.webhookEventLog.findFirst({
      where: { source: STALL_ALERT_SOURCE, externalId: lot.liveRoomItemId, processed: true },
      select: { id: true },
    });
    if (already) continue;

    const titleShort = lot.title.length > 80 ? `${lot.title.slice(0, 77)}…` : lot.title;
    reportCronAnomaly(
      "live-auction-stall",
      `Auction lot "${titleShort}" (room ${lot.liveRoomId}, item ${lot.liveRoomItemId}, seller ${lot.sellerId}) ` +
        `has had a locked-in winner for ${lot.hoursSinceTimerEnded.toFixed(1)}h with no host "mark sold" action. ` +
        `Winner is stranded with no order/charge until the host acts — this is expected product behavior for ` +
        `auction rooms, but has gone unusually long. Consider reaching out to the seller or offering the buyer ` +
        `a way to back out.`,
    );

    await createNotification(prisma, {
      userId: lot.winnerId,
      type: "auction_win_pending_seller_confirmation",
      title: "Your win is still pending",
      body: `Your winning bid on “${titleShort}” is locked in, but the seller hasn't confirmed the sale yet. Our team has been notified — you don't need to do anything yet.`,
      href: `/live/${encodeURIComponent(lot.liveRoomId)}`,
    });

    await prisma.webhookEventLog.create({
      data: {
        source: STALL_ALERT_SOURCE,
        externalId: lot.liveRoomItemId,
        eventType: "stalled_pending_winner",
        payload: "",
        processed: true,
      },
    });
    newlyAlerted += 1;
  }

  return { checked: lots.length, newlyAlerted };
}
