import { NextResponse } from "next/server";
import { listAdminUserActivity } from "@/lib/admin/admin-user-activity";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);
  const exists = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "60");
  const daysRaw = Number(url.searchParams.get("days") ?? "90");
  const payload = await listAdminUserActivity(id, {
    limit: Number.isFinite(limitRaw) ? limitRaw : 60,
    lookbackDays: Number.isFinite(daysRaw) ? daysRaw : 90,
  });
  return NextResponse.json(payload);
}
