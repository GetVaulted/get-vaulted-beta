import { NextResponse } from "next/server";
import type { SupportTicketStatus } from "@/generated/prisma/enums";
import { scheduleNotifyAdmins } from "@/lib/admin/notify-admins";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { serializeSupportTicket } from "@/lib/support-tickets";

/** One-time backlog alert so admins catch tickets created before notify-on-create shipped. */
export const SUPPORT_OPEN_DIGEST_DEDUPE_KEY = "support-open-digest:v1";

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

  if (openCount > 0) {
    scheduleNotifyAdmins({
      type: "admin_support_tickets_open_digest",
      title: "Open support tickets need attention",
      body: `${openCount} open ticket${openCount === 1 ? "" : "s"} need attention.`,
      href: "/admin/support-tickets",
      dedupeKey: SUPPORT_OPEN_DIGEST_DEDUPE_KEY,
    });
  }

  return NextResponse.json({ tickets: rows.map(serializeSupportTicket), openCount });
}
