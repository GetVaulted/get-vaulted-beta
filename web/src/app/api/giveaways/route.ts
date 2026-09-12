import { NextResponse } from "next/server";
import { GiveawayCampaignStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { getCampaignEntryStats } from "@/lib/giveaway/entries";

export const runtime = "nodejs";

/** Public list of visible campaigns (active preferred; ended for recent winners). */
export async function GET() {
  const now = new Date();
  const campaigns = await prisma.giveawayCampaign.findMany({
    where: {
      status: {
        in: [
          GiveawayCampaignStatus.active,
          GiveawayCampaignStatus.scheduled,
          GiveawayCampaignStatus.ended,
        ],
      },
    },
    orderBy: { startsAt: "desc" },
    take: 20,
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      prizeLabel: true,
      prizeAmountUsd: true,
      prizeType: true,
      status: true,
      startsAt: true,
      endsAt: true,
      winnerConfirmedAt: true,
      prizeAwardedAt: true,
    },
  });

  const withStats = await Promise.all(
    campaigns.map(async (c) => {
      const stats =
        c.status === GiveawayCampaignStatus.active || c.status === GiveawayCampaignStatus.ended
          ? await getCampaignEntryStats(c.id)
          : { totalEntries: 0, totalEntrants: 0 };
      const isLive =
        c.status === GiveawayCampaignStatus.active && c.startsAt <= now && c.endsAt >= now;
      return { ...c, ...stats, isLive };
    }),
  );

  const active = withStats.find((c) => c.isLive) ?? null;
  return NextResponse.json({ campaigns: withStats, active });
}
