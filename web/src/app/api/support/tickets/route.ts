import { NextResponse } from "next/server";
import type { SupportTicketCategory } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { SUPPORT_TICKET_CATEGORIES, serializeSupportTicket } from "@/lib/support-tickets";

type Body = {
  category?: string;
  subject?: string;
  message?: string;
  contactEmail?: string;
  referenceType?: string;
  referenceId?: string;
};

function trim(s: unknown, max: number): string {
  if (typeof s !== "string") return "";
  return s.trim().slice(0, max);
}

export async function GET(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const status = url.searchParams.get("status")?.trim();

  const rows = await prisma.supportTicket.findMany({
    where: {
      userId: auth.userId,
      ...(status ? { status: status as never } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      user: { select: { username: true } },
      assignedAdmin: { select: { username: true } },
    },
  });

  return NextResponse.json({ tickets: rows.map(serializeSupportTicket) });
}

export async function POST(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const category = trim(body.category, 32) as SupportTicketCategory;
  if (!SUPPORT_TICKET_CATEGORIES.has(category)) {
    return NextResponse.json({ error: "Invalid category." }, { status: 400 });
  }

  const message = trim(body.message, 8000);
  if (!message) {
    return NextResponse.json({ error: "Message required." }, { status: 400 });
  }

  const subject = trim(body.subject, 200) || "Support request";
  const contactEmail = trim(body.contactEmail, 320);
  const referenceType = trim(body.referenceType, 64) || null;
  const referenceId = trim(body.referenceId, 128) || null;

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { email: true },
  });

  const row = await prisma.supportTicket.create({
    data: {
      userId: auth.userId,
      category,
      subject,
      message,
      contactEmail: contactEmail || user?.email || "",
      referenceType,
      referenceId,
    },
    include: {
      user: { select: { username: true } },
      assignedAdmin: { select: { username: true } },
    },
  });

  return NextResponse.json({ ticket: serializeSupportTicket(row) }, { status: 201 });
}
