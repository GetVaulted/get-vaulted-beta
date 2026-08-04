import { createHash, randomBytes } from "crypto";
import {
  GiveawayCampaignStatus,
  GiveawayDrawStatus,
  GiveawayPrizeType,
  PlatformCreditSourceType,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { getCampaignEntryStats } from "@/lib/giveaway/entries";
import { awardPlatformCredit } from "@/lib/giveaway/platform-credit";
import { createNotification } from "@/lib/notifications";

/** Weighted tickets: each entry quantity = one chance. Cryptographically seeded. */
export function pickWeightedWinner(
  tickets: Array<{ userId: string; weight: number }>,
  seedMaterial: string,
): { winnerUserId: string; drawSeed: string; drawHash: string; ticketIndex: number } {
  const expanded: string[] = [];
  for (const t of tickets) {
    const w = Math.max(0, Math.floor(t.weight));
    for (let i = 0; i < w; i++) expanded.push(t.userId);
  }
  if (expanded.length === 0) throw new Error("no_tickets");

  const drawSeed = `${seedMaterial}:${Date.now()}:${randomBytes(16).toString("hex")}`;
  const drawHash = createHash("sha256").update(drawSeed).digest("hex");
  const hashBuf = createHash("sha256").update(drawSeed).digest();
  const ticketIndex = hashBuf.readUInt32BE(0) % expanded.length;
  const winnerUserId = expanded[ticketIndex]!;
  return { winnerUserId, drawSeed, drawHash, ticketIndex };
}

export async function drawGiveawayWinner(args: {
  campaignId: string;
  adminUserId: string;
  isRedraw?: boolean;
  redrawReason?: string;
}) {
  const campaign = await prisma.giveawayCampaign.findUnique({ where: { id: args.campaignId } });
  if (!campaign) throw new Error("campaign_not_found");
  if (
    campaign.status !== GiveawayCampaignStatus.active &&
    campaign.status !== GiveawayCampaignStatus.ended &&
    campaign.status !== GiveawayCampaignStatus.paused
  ) {
    throw new Error("campaign_not_drawable");
  }
  if (args.isRedraw && !args.redrawReason?.trim()) {
    throw new Error("redraw_reason_required");
  }

  const grouped = await prisma.giveawayEntryLedger.groupBy({
    by: ["userId"],
    where: { campaignId: args.campaignId },
    _sum: { quantity: true },
  });
  const tickets = grouped
    .map((g) => ({ userId: g.userId, weight: g._sum.quantity ?? 0 }))
    .filter((t) => t.weight > 0);
  if (tickets.length === 0) throw new Error("no_entries");

  const { totalEntries, totalEntrants } = await getCampaignEntryStats(args.campaignId);
  const pick = pickWeightedWinner(tickets, `campaign:${args.campaignId}:admin:${args.adminUserId}`);

  if (args.isRedraw) {
    await prisma.giveawayDraw.updateMany({
      where: {
        campaignId: args.campaignId,
        status: { in: [GiveawayDrawStatus.pending_confirm, GiveawayDrawStatus.confirmed] },
      },
      data: { status: GiveawayDrawStatus.superseded },
    });
  }

  const draw = await prisma.giveawayDraw.create({
    data: {
      campaignId: args.campaignId,
      winnerUserId: pick.winnerUserId,
      totalEntries,
      totalEntrants,
      drawSeed: pick.drawSeed,
      drawHash: pick.drawHash,
      isRedraw: Boolean(args.isRedraw),
      redrawReason: args.redrawReason?.trim() || null,
      adminUserId: args.adminUserId,
      status: GiveawayDrawStatus.pending_confirm,
    },
  });

  await prisma.giveawayCampaign.update({
    where: { id: args.campaignId },
    data: {
      winnerUserId: pick.winnerUserId,
      winnerConfirmedAt: null,
      prizeAwardedAt: null,
    },
  });

  return draw;
}

/** Confirm winner and award prize (idempotent). Does not auto-run on draw. */
export async function confirmGiveawayWinner(args: {
  campaignId: string;
  drawId: string;
  adminUserId: string;
}) {
  const draw = await prisma.giveawayDraw.findUnique({ where: { id: args.drawId } });
  if (!draw || draw.campaignId !== args.campaignId) throw new Error("draw_not_found");
  if (draw.status === GiveawayDrawStatus.superseded) throw new Error("draw_superseded");

  const campaign = await prisma.giveawayCampaign.findUnique({ where: { id: args.campaignId } });
  if (!campaign) throw new Error("campaign_not_found");

  if (draw.status !== GiveawayDrawStatus.confirmed) {
    await prisma.giveawayDraw.update({
      where: { id: draw.id },
      data: { status: GiveawayDrawStatus.confirmed },
    });
  }

  const now = new Date();
  if (!campaign.winnerConfirmedAt) {
    await prisma.giveawayCampaign.update({
      where: { id: campaign.id },
      data: {
        winnerUserId: draw.winnerUserId,
        winnerConfirmedAt: now,
        status: GiveawayCampaignStatus.ended,
      },
    });
  }

  if (campaign.prizeType === GiveawayPrizeType.platform_credit && campaign.prizeAmountUsd > 0) {
    const award = await awardPlatformCredit({
      userId: draw.winnerUserId,
      amountUsd: campaign.prizeAmountUsd,
      sourceType: PlatformCreditSourceType.giveaway_prize,
      sourceRef: draw.id,
    });
    if (award.created || !campaign.prizeAwardedAt) {
      await prisma.giveawayCampaign.update({
        where: { id: campaign.id },
        data: { prizeAwardedAt: now },
      });
    }
    if (award.created) {
      await createNotification(prisma, {
        userId: draw.winnerUserId,
        type: "giveaway_prize_awarded",
        title: "You won!",
        body: `You won ${campaign.prizeLabel || `$${campaign.prizeAmountUsd.toFixed(0)} Get Vaulted Credit`}! Credit has been added to your wallet.`,
        href: "/account/financials",
      });
    }
  }

  return prisma.giveawayCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
}
