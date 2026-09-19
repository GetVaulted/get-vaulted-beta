import { NextResponse } from "next/server";
import { GiveawayCampaignStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { getServerSessionSafe } from "@/lib/auth";
import {
  getCampaignEntryStats,
  getUserGiveawayEntrySummary,
} from "@/lib/giveaway/entries";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { slug: raw } = await ctx.params;
  const slug = decodeURIComponent(raw).trim().toLowerCase();
  const now = new Date();

  const campaign = await prisma.giveawayCampaign.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      rulesText: true,
      prizeLabel: true,
      prizeAmountUsd: true,
      prizeType: true,
      status: true,
      startsAt: true,
      endsAt: true,
      winnerConfirmedAt: true,
      prizeAwardedAt: true,
      winnerUser: { select: { username: true } },
    },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Giveaway not found." }, { status: 404 });
  }

  // Hide drafts/cancelled from public
  if (
    campaign.status === GiveawayCampaignStatus.draft ||
    campaign.status === GiveawayCampaignStatus.cancelled
  ) {
    return NextResponse.json({ error: "Giveaway not found." }, { status: 404 });
  }

  const stats = await getCampaignEntryStats(campaign.id);
  const isLive =
    campaign.status === GiveawayCampaignStatus.active &&
    campaign.startsAt <= now &&
    campaign.endsAt >= now;

  let myEntries: {
    totalEntries: number;
    referralEntries: number;
    purchaseEntries: number;
    history: Array<{
      id: string;
      entryType: string;
      quantity: number;
      source: string;
      createdAt: string;
    }>;
    referralCode: string | null;
  } | null = null;

  const session = await getServerSessionSafe();
  const userId = session?.user?.id;
  if (userId) {
    const summary = await getUserGiveawayEntrySummary(campaign.id, userId);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    });
    myEntries = {
      totalEntries: summary.totalEntries,
      referralEntries: summary.referralEntries,
      purchaseEntries: summary.purchaseEntries,
      history: summary.history.map((h) => ({
        id: h.id,
        entryType: h.entryType,
        quantity: h.quantity,
        source: h.source,
        createdAt: h.createdAt.toISOString(),
      })),
      referralCode: user?.referralCode ?? null,
    };
  }

  return NextResponse.json({
    campaign: {
      ...campaign,
      ...stats,
      isLive,
      startsAt: campaign.startsAt.toISOString(),
      endsAt: campaign.endsAt.toISOString(),
      winnerConfirmedAt: campaign.winnerConfirmedAt?.toISOString() ?? null,
      prizeAwardedAt: campaign.prizeAwardedAt?.toISOString() ?? null,
      winnerUsername: campaign.winnerUser?.username ?? null,
    },
    myEntries,
  });
}
