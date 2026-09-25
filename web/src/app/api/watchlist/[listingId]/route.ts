import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(req: Request, ctx: { params: Promise<{ listingId: string }> }) {
  const auth = await resolveAccountUserId(req, { skipStripeSiblingSync: true });
  if (auth instanceof NextResponse) return auth;

  const { listingId: raw } = await ctx.params;
  const listingId = decodeURIComponent(raw);

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.watchlistItem.deleteMany({
      where: {
        userId: auth.userId,
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
