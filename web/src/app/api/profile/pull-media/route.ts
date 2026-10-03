/**
 * Seller's own "Pulls" media: list (management view) and reorder.
 * Always scoped to the authenticated caller — no `userId`/`sellerId` query param accepted,
 * so a seller can never list or reorder another seller's private management view (the
 * public, read-only view for buyers is `/api/sellers/pull-media`).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveListingsUserId } from "@/lib/resolve-listings-auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await resolveListingsUserId(req);
  if (auth instanceof NextResponse) return auth;

  const rows = await prisma.profilePullMedia.findMany({
    where: { sellerId: auth.userId },
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { likes: true, comments: true } } },
  });
  const media = rows.map(({ _count, ...rest }) => ({
    ...rest,
    likeCount: _count.likes,
    commentCount: _count.comments,
  }));

  return NextResponse.json({ media });
}

export async function PATCH(req: Request) {
  const auth = await resolveListingsUserId(req);
  if (auth instanceof NextResponse) return auth;

  let body: { order?: unknown };
  try {
    body = (await req.json()) as { order?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const order = Array.isArray(body.order) ? body.order.filter((id): id is string => typeof id === "string") : null;
  if (!order || !order.length) {
    return NextResponse.json({ error: "order (array of media ids) is required." }, { status: 400 });
  }

  const owned = await prisma.profilePullMedia.findMany({
    where: { sellerId: auth.userId, id: { in: order } },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((r) => r.id));
  if (ownedIds.size !== order.length || order.some((id) => !ownedIds.has(id))) {
    return NextResponse.json({ error: "One or more media ids are invalid." }, { status: 403 });
  }

  await prisma.$transaction(
    order.map((id, index) =>
      prisma.profilePullMedia.update({
        where: { id },
        data: { sortOrder: index },
      }),
    ),
  );

  const media = await prisma.profilePullMedia.findMany({
    where: { sellerId: auth.userId },
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json({ media });
}
