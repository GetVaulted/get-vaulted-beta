import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

/** Show picker for the move tool: search by show title, show id, or seller @username. */
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().replace(/^@/, "").slice(0, 100);
  const contains = { contains: q, mode: "insensitive" as const };
  const rooms = await prisma.liveRoom.findMany({
    where: q.length >= 2 ? { OR: [{ title: contains }, { id: q }, { seller: { username: contains } }] } : {},
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      title: true,
      status: true,
      scheduledStartAt: true,
      endedAt: true,
      seller: { select: { username: true } },
      _count: { select: { items: true } },
    },
  });
  return NextResponse.json({
    shows: rooms.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      seller: r.seller.username,
      items: r._count.items,
      when: (r.endedAt ?? r.scheduledStartAt)?.toISOString() ?? null,
    })),
  });
}
