import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

/**
 * Admin lookup: "where has this user's app traffic been coming from, and is
 * anyone else logging in from the same IP" (ban-evasion / multi-account /
 * account-sharing investigation).
 *
 * GET /api/admin/trust/user-ip-log?username=joeknows
 * GET /api/admin/trust/user-ip-log?userId=cku123...
 */
export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const username = url.searchParams.get("username")?.trim();
  const userIdParam = url.searchParams.get("userId")?.trim();

  if (!username && !userIdParam) {
    return NextResponse.json({ error: "username or userId is required" }, { status: 400 });
  }

  const user = userIdParam
    ? await prisma.user.findUnique({ where: { id: userIdParam }, select: { id: true, username: true } })
    : await prisma.user.findUnique({ where: { username: username! }, select: { id: true, username: true } });

  if (!user) {
    return NextResponse.json({ error: "No user found for that username." }, { status: 404 });
  }

  const logs = await prisma.userIpLog.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const ipsSeen = [...new Set(logs.map((l) => l.ipAddress))];

  const others = ipsSeen.length
    ? await prisma.userIpLog.findMany({
        where: { ipAddress: { in: ipsSeen }, userId: { not: user.id } },
        select: { userId: true, ipAddress: true, createdAt: true, user: { select: { username: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      })
    : [];

  const seenOtherAccounts = new Map<string, { username: string; ipAddress: string; lastSeenAt: Date }>();
  for (const row of others) {
    const key = `${row.userId}:${row.ipAddress}`;
    if (!seenOtherAccounts.has(key)) {
      seenOtherAccounts.set(key, {
        username: row.user.username,
        ipAddress: row.ipAddress,
        lastSeenAt: row.createdAt,
      });
    }
  }

  return NextResponse.json({
    user: { id: user.id, username: user.username },
    ipHistory: logs.map((l) => ({
      ipAddress: l.ipAddress,
      source: l.source,
      userAgent: l.userAgent,
      seenAt: l.createdAt,
    })),
    otherAccountsSameIp: Array.from(seenOtherAccounts.values()),
  });
}
