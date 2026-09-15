import { NextResponse } from "next/server";
import { getAdminUserReferralSnapshot } from "@/lib/admin/admin-referral-credits";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);
  const exists = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const snapshot = await getAdminUserReferralSnapshot(id);
  return NextResponse.json({ referral: snapshot });
}
