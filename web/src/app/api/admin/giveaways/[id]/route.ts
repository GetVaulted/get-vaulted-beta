import { NextResponse } from "next/server";
import { GiveawayCampaignStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { backfillExistingUserEntries } from "@/lib/giveaway/entries";
import { getCampaignAdminAnalytics } from "@/lib/giveaway/purchase-entries";
import { confirmGiveawayWinner, drawGiveawayWinner } from "@/lib/giveaway/draw";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;

  const campaign = await prisma.giveawayCampaign.findUnique({
    where: { id },
    include: {
      winnerUser: { select: { id: true, username: true, email: true } },
      draws: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          winnerUser: { select: { id: true, username: true, email: true } },
          adminUser: { select: { id: true, username: true } },
        },
      },
    },
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const analytics = await getCampaignAdminAnalytics(id);

  return NextResponse.json({ campaign: { ...campaign, ...analytics } });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const existing = await prisma.giveawayCampaign.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (typeof body.title === "string") data.title = body.title.trim();
  if (typeof body.description === "string") data.description = body.description;
  if (typeof body.rulesText === "string") data.rulesText = body.rulesText;
  if (typeof body.prizeLabel === "string") data.prizeLabel = body.prizeLabel.trim();
  if (body.prizeAmountUsd != null) data.prizeAmountUsd = Number(body.prizeAmountUsd);
  if (body.startsAt) data.startsAt = new Date(String(body.startsAt));
  if (body.endsAt) data.endsAt = new Date(String(body.endsAt));

  if (typeof body.status === "string") {
    const status = body.status as GiveawayCampaignStatus;
    if (!Object.values(GiveawayCampaignStatus).includes(status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    data.status = status;
  }

  const campaign = await prisma.giveawayCampaign.update({ where: { id }, data });

  let backfill: { scanned: number; created: number } | null = null;
  if (body.status === GiveawayCampaignStatus.active && existing.status !== GiveawayCampaignStatus.active) {
    backfill = await backfillExistingUserEntries({ campaignId: id });
  }

  return NextResponse.json({ campaign, backfill });
}

export async function POST(req: Request, ctx: Ctx) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    redrawReason?: string;
    drawId?: string;
  };

  try {
    if (body.action === "backfill") {
      const result = await backfillExistingUserEntries({ campaignId: id });
      return NextResponse.json({ ok: true, ...result });
    }
    if (body.action === "draw") {
      const draw = await drawGiveawayWinner({
        campaignId: id,
        adminUserId: gate.userId,
        isRedraw: false,
      });
      return NextResponse.json({ ok: true, draw });
    }
    if (body.action === "redraw") {
      const draw = await drawGiveawayWinner({
        campaignId: id,
        adminUserId: gate.userId,
        isRedraw: true,
        redrawReason: body.redrawReason,
      });
      return NextResponse.json({ ok: true, draw });
    }
    if (body.action === "confirm_winner") {
      if (!body.drawId) return NextResponse.json({ error: "drawId required" }, { status: 400 });
      const campaign = await confirmGiveawayWinner({
        campaignId: id,
        drawId: body.drawId,
        adminUserId: gate.userId,
      });
      return NextResponse.json({ ok: true, campaign });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
