import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();

  const where: Prisma.UserWhereInput = {};
  if (q.length > 0) {
    where.OR = [
      { email: { contains: q } },
      { username: { contains: q } },
    ];
  }

  const rows = await prisma.user.findMany({
    where,
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      suspendedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 150,
  });

  return NextResponse.json({
    users: rows.map((u) => ({
      id: u.id,
      email: u.email,
      username: u.username,
      role: u.role,
      suspendedAt: u.suspendedAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
    })),
  });
}
