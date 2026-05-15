import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateAddressPatchInput, type AddressInput } from "@/lib/address-book";
import type { AddressType } from "@/generated/prisma/enums";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const existing = await prisma.address.findFirst({
    where: { id: decodeURIComponent(id), userId: session.user.id },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: AddressInput;
  try {
    body = (await req.json()) as AddressInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = validateAddressPatchInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const patch = parsed.data;
  const nextType = (patch.type as AddressType | undefined) ?? existing.type;
  const nextDefault = typeof patch.isDefault === "boolean" ? patch.isDefault : existing.isDefault;
  const address = await prisma.$transaction(async (tx) => {
    if (nextDefault) {
      await tx.address.updateMany({
        where: { userId: session.user.id, type: nextType, isDefault: true, id: { not: existing.id } },
        data: { isDefault: false },
      });
    }
    return tx.address.update({
      where: { id: existing.id },
      data: patch,
    });
  });
  return NextResponse.json({ address });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const existing = await prisma.address.findFirst({
    where: { id: decodeURIComponent(id), userId: session.user.id },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.$transaction(async (tx) => {
    await tx.address.delete({ where: { id: existing.id } });
    if (existing.isDefault) {
      const replacement = await tx.address.findFirst({
        where: { userId: session.user.id, type: existing.type },
        orderBy: { createdAt: "asc" },
      });
      if (replacement) {
        await tx.address.update({ where: { id: replacement.id }, data: { isDefault: true } });
      }
    }
  });
  return NextResponse.json({ ok: true });
}
