import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { logAdminAction } from "@/lib/admin/admin-audit";

export class SupportToolError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
    this.name = "SupportToolError";
  }
}

export const ADMIN_MESSAGE_TYPE = "admin_message";
export const NOTE_TARGET_TYPES = ["user", "order", "live_room", "refund_request", "dispute", "support_ticket"] as const;
export type NoteTargetType = (typeof NOTE_TARGET_TYPES)[number];

/** Only in-app paths: an admin message must never carry an off-site link. */
export function safeInternalHref(raw: unknown): string {
  if (typeof raw !== "string") return "/account/notifications";
  const h = raw.trim();
  return h.startsWith("/") && !h.startsWith("//") && !h.includes("\\") ? h.slice(0, 500) : "/account/notifications";
}

/** Send one member an in-app notification (and push) from support. Logged with the reason. */
export async function sendAdminMessage(args: {
  adminUserId: string;
  userId: string;
  title: string;
  body: string;
  href?: string;
  reason: string;
}) {
  const title = args.title.trim().slice(0, 120);
  const body = args.body.trim().slice(0, 1000);
  if (!title || !body) throw new SupportToolError("TITLE_AND_BODY_REQUIRED", 400);

  const user = await prisma.user.findUnique({ where: { id: args.userId }, select: { id: true, suspendedAt: true } });
  if (!user) throw new SupportToolError("NOT_FOUND", 404);

  const href = safeInternalHref(args.href);
  const notificationId = await createNotification(prisma, {
    userId: user.id,
    type: ADMIN_MESSAGE_TYPE,
    title,
    body,
    href,
  });
  if (!notificationId) throw new SupportToolError("SEND_FAILED", 502);

  await logAdminAction({
    adminUserId: args.adminUserId,
    action: "support.message_user",
    targetType: "user",
    targetId: user.id,
    targetUserId: user.id,
    reason: args.reason,
    detail: { notificationId, title, href },
  });
  return { notificationId };
}

export async function listAdminNotes(targetType: string, targetId: string) {
  const rows = await prisma.adminNote.findMany({
    where: { targetType, targetId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const authors = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.authorId))] } },
    select: { id: true, username: true },
  });
  const name = new Map(authors.map((a) => [a.id, a.username]));
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    author: name.get(r.authorId) ?? "admin",
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function addAdminNote(args: { adminUserId: string; targetType: string; targetId: string; body: string }) {
  if (!(NOTE_TARGET_TYPES as readonly string[]).includes(args.targetType)) throw new SupportToolError("BAD_TARGET", 400);
  const body = args.body.trim().slice(0, 2000);
  if (body.length < 2) throw new SupportToolError("NOTE_REQUIRED", 400);
  const targetId = args.targetId.trim().slice(0, 100);
  if (!targetId) throw new SupportToolError("BAD_TARGET", 400);
  const row = await prisma.adminNote.create({
    data: { targetType: args.targetType, targetId, authorId: args.adminUserId, body },
  });
  return { id: row.id };
}
