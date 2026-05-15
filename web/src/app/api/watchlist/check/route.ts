import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const listingId = new URL(req.url).searchParams.get("listingId")?.trim() ?? "";
  if (!listingId) {
    return NextResponse.json({ error: "Missing listingId" }, { status: 400 });
  }

  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ saved: false });
  }

  const row = await prisma.watchlistItem.findUnique({
    where: {
      userId_listingId: {
        userId: session.user.id,
        listingId,
      },
    },
    select: { id: true },
  });

  return NextResponse.json({ saved: Boolean(row) });
}
