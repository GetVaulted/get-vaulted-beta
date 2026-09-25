import { NextResponse } from "next/server";
import { GiveawayCampaignStatus, GiveawayPrizeType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { getCampaignEntryStats } from "@/lib/giveaway/entries";

export const runtime = "nodejs";

function slugify(title: string): string {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || `giveaway-${Date.now()}`
  );
}

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const campaigns = await prisma.giveawayCampaign.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const withStats = await Promise.all(
    campaigns.map(async (c) => {
      const stats = await getCampaignEntryStats(c.id);
      return { ...c, ...stats };
    }),
  );
  return NextResponse.json({ campaigns: withStats });
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const startsAt = body.startsAt ? new Date(String(body.startsAt)) : new Date();
  const endsAt = body.endsAt
    ? new Date(String(body.endsAt))
    : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    return NextResponse.json({ error: "invalid dates" }, { status: 400 });
  }

  let slug =
    typeof body.slug === "string" && body.slug.trim() ? slugify(body.slug) : slugify(title);
  const existing = await prisma.giveawayCampaign.findUnique({ where: { slug } });
  if (existing) slug = `${slug}-${Date.now().toString(36)}`;

  const prizeAmountUsd =
    typeof body.prizeAmountUsd === "number" ? body.prizeAmountUsd : Number(body.prizeAmountUsd) || 500;

  const campaign = await prisma.giveawayCampaign.create({
    data: {
      slug,
      title,
      description: typeof body.description === "string" ? body.description : "",
      rulesText: typeof body.rulesText === "string" ? body.rulesText : "",
      prizeType: GiveawayPrizeType.platform_credit,
      prizeAmountUsd,
      prizeLabel:
        typeof body.prizeLabel === "string" && body.prizeLabel.trim()
          ? body.prizeLabel.trim()
          : `$${prizeAmountUsd.toFixed(0)} Get Vaulted Credit`,
      status: GiveawayCampaignStatus.draft,
      startsAt,
      endsAt,
    },
  });

  return NextResponse.json({ campaign });
}
