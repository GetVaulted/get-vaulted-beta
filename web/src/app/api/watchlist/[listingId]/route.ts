import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(_req: Request, ctx: { params: Promise<{ listingId: string }> }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { listingId: raw } = await ctx.params;
  const listingId = decodeURIComponent(raw);

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.watchlistItem.deleteMany({
      where: {
        userId: session.user.id,
        listingId,
      },
    });
    if (count > 0) {
      // GREATEST clamp keeps this from ever going negative regardless of ordering/races.
      await tx.$executeRaw`
        UPDATE "Listing"
        SET "watchersCount" = GREATEST(0, "watchersCount" - 1)
        WHERE id = ${listingId}
      `;
    }
  });

  return NextResponse.json({ ok: true });
}
