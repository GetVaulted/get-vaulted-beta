import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

type Body = { action?: string; isCompanyListing?: boolean };

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action.trim() : "";

  const existing = await prisma.listing.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (typeof body.isCompanyListing === "boolean") {
    await prisma.listing.update({
      where: { id },
      data: { isCompanyListing: body.isCompanyListing },
    });
    if (!action) return NextResponse.json({ ok: true });
  }

  if (action === "remove") {
    await prisma.listing.update({
      where: { id },
      data: { moderationRemovedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }
  if (action === "restore") {
    await prisma.listing.update({
      where: { id },
      data: { moderationRemovedAt: null },
    });
    return NextResponse.json({ ok: true });
  }
  if (action === "mark_reviewed") {
    await prisma.listing.update({
      where: { id },
      data: { adminReviewedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action." }, { status: 400 });
}
