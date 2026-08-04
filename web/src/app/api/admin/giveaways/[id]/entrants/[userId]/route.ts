import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; userId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const { id: campaignId, userId } = await ctx.params;

  const [user, history, flags] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, email: true, createdAt: true, emailVerified: true, referredById: true },
    }),
    prisma.giveawayEntryLedger.findMany({
      where: { campaignId, userId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.giveawayFraudFlag.findMany({
      where: { campaignId, userId },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const totalEntries = history.reduce((s, r) => s + r.quantity, 0);
  return NextResponse.json({ user, totalEntries, history, flags });
}
