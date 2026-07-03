import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { sendMassNotification } from "@/lib/admin/send-mass-notification";
import { validateMassNotificationInput } from "@/lib/admin/mass-notification";

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const rows = await prisma.notificationBroadcast.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { createdByUser: { select: { username: true } } },
  });

  return NextResponse.json({
    broadcasts: rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      href: row.href,
      audience: row.audience,
      recipientCount: row.recipientCount,
      pushSentCount: row.pushSentCount,
      createdByUsername: row.createdByUser?.username ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
  });
}

type Body = { title?: unknown; body?: unknown; href?: unknown };

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let raw: Body = {};
  try {
    raw = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = typeof raw.title === "string" ? raw.title : "";
  const body = typeof raw.body === "string" ? raw.body : "";
  const href = typeof raw.href === "string" ? raw.href : null;

  const fieldError = validateMassNotificationInput({ title, body, href });
  if (fieldError) {
    return NextResponse.json({ error: fieldError.message, field: fieldError.field }, { status: 400 });
  }

  try {
    const result = await sendMassNotification({ title, body, href, createdByUserId: gate.userId });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("mass notification broadcast failed", e);
    return NextResponse.json({ error: "Could not send notification. Try again." }, { status: 500 });
  }
}
