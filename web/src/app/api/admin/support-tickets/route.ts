import { NextResponse } from "next/server";
import type { SupportTicketStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { serializeSupportTicket } from "@/lib/support-tickets";

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const status = url.searchParams.get("status")?.trim() as SupportTicketStatus | undefined;
  const q = url.searchParams.get("q")?.trim();

  const rows = await prisma.supportTicket.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { subject: { contains: q, mode: "insensitive" } },
              { message: { contains: q, mode: "insensitive" } },
              { referenceId: { contains: q, mode: "insensitive" } },
              { user: { username: { contains: q, mode: "insensitive" } } },
              { contactEmail: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      user: { select: { username: true } },
      assignedAdmin: { select: { username: true } },
    },
  });

  const openCount = await prisma.supportTicket.count({
    where: { status: { in: ["submitted", "in_progress"] } },
  });

  return NextResponse.json({ tickets: rows.map(serializeSupportTicket), openCount });
}
