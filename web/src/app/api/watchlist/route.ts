import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Body = { listingId?: string };

export async function POST(req: Request) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const listingId = typeof body.listingId === "string" ? body.listingId.trim() : "";
  if (!listingId) {
    return NextResponse.json({ error: "Missing listingId" }, { status: 400 });
  }

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { id: true, sellerId: true, moderationRemovedAt: true },
  });

  if (!listing) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }
  if (listing.moderationRemovedAt) {
    return NextResponse.json({ error: "This listing is not available." }, { status: 410 });
  }
  if (listing.sellerId === session.user.id) {
    return NextResponse.json({ error: "You cannot save your own listing." }, { status: 400 });
  }

  try {
    await prisma.$transaction([
      prisma.watchlistItem.create({
        data: {
          userId: session.user.id,
          listingId: listing.id,
        },
      }),
      prisma.listing.update({
        where: { id: listing.id },
        data: { watchersCount: { increment: 1 } },
      }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002") {
      return NextResponse.json({ ok: true, alreadySaved: true });
    }
    console.error(e);
    return NextResponse.json({ error: "Could not save to watchlist." }, { status: 500 });
  }
}
