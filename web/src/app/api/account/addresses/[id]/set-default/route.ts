import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveAccountUserId(req, { skipStripeSiblingSync: true });
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const address = await prisma.address.findFirst({
    where: { id: decodeURIComponent(id), userId: auth.userId },
  });
  if (!address) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const updated = await prisma.$transaction(async (tx) => {
    await tx.address.updateMany({
      where: {
        userId: auth.userId,
        type: address.type,
        isDefault: true,
        id: { not: address.id },
      },
      data: { isDefault: false },
    });
    return tx.address.update({
      where: { id: address.id },
      data: { isDefault: true },
    });
  });
  return NextResponse.json({ address: updated });
}
