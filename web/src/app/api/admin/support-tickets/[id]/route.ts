import { NextResponse } from "next/server";
import type { SupportTicketStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { SUPPORT_TICKET_STATUSES, serializeSupportTicket } from "@/lib/support-tickets";

type Body = {
  status?: string;
  adminNotes?: string;
};

function trim(s: unknown, max: number): string {
  if (typeof s !== "string") return "";
  return s.trim().slice(0, max);
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);
  const row = await prisma.supportTicket.findUnique({
    where: { id },
    include: {
      user: { select: { username: true } },
      assignedAdmin: { select: { username: true } },
    },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ticket: serializeSupportTicket(row) });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const existing = await prisma.supportTicket.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const statusRaw = trim(body.status, 32) as SupportTicketStatus;
  const nextStatus = statusRaw && SUPPORT_TICKET_STATUSES.has(statusRaw) ? statusRaw : existing.status;
  const adminNotes = body.adminNotes !== undefined ? trim(body.adminNotes, 4000) : existing.adminNotes;

  const row = await prisma.supportTicket.update({
    where: { id },
    data: {
      status: nextStatus,
      adminNotes,
      assignedAdminId: gate.userId,
      resolvedAt:
        nextStatus === "resolved" || nextStatus === "closed"
          ? existing.resolvedAt ?? new Date()
          : nextStatus === "submitted" || nextStatus === "in_progress"
            ? null
            : existing.resolvedAt,
    },
    include: {
      user: { select: { username: true } },
      assignedAdmin: { select: { username: true } },
    },
  });

  return NextResponse.json({ ticket: serializeSupportTicket(row) });
}
