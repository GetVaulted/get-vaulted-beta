import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const address = await prisma.address.findFirst({
    where: { id: decodeURIComponent(id), userId: session.user.id },
  });
  if (!address) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const updated = await prisma.$transaction(async (tx) => {
    await tx.address.updateMany({
      where: {
        userId: session.user.id,
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
