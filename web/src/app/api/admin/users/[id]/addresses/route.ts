import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);
  const exists = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await prisma.address.findMany({
    where: { userId: id },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });

  const addresses = rows.map((a) => ({
    id: a.id,
    type: a.type,
    name: a.name,
    fullName: a.fullName,
    company: a.company,
    line1: a.line1,
    line2: a.line2,
    city: a.city,
    state: a.state,
    postalCode: a.postalCode,
    country: a.country,
    phone: a.phone,
    email: a.email,
    isDefault: a.isDefault,
    isVerified: a.isVerified,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }));

  return NextResponse.json({ addresses });
}
