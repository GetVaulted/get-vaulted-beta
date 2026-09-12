import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { isUserBlockError, setUserBlocked } from "@/lib/user-block";
import { prisma } from "@/lib/prisma";

type Body = {
  action?: string;
  value?: boolean;
};

export async function PATCH(req: Request, ctx: { params: Promise<{ threadId: string }> }) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;
  const uid = auth.userId;

  const { threadId: raw } = await ctx.params;
  const threadId = decodeURIComponent(raw);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action.trim() : "";
  if (!action) return NextResponse.json({ error: "Missing action." }, { status: 400 });

  const thread = await prisma.messageThread.findFirst({
    where: {
      id: threadId,
      OR: [{ buyerId: uid }, { sellerId: uid }],
    },
  });

  if (!thread) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (action === "accept_request") {
    // `sellerId` is the request recipient (not always a marketplace seller — profile DMs use the same fields).
    if (thread.sellerId !== uid) {
      return NextResponse.json({ error: "Only the recipient can accept this request." }, { status: 403 });
    }
    await prisma.messageThread.update({
      where: { id: threadId },
      data: { inbox: "primary" },
    });
    return NextResponse.json({ ok: true, inbox: "primary" });
  }

  const participant = await prisma.messageThreadParticipant.upsert({
    where: { threadId_userId: { threadId, userId: uid } },
    create: { threadId, userId: uid },
    update: {},
  });

  if (action === "pin") {
    const pin = body.value !== false;
    await prisma.messageThreadParticipant.update({
      where: { id: participant.id },
      data: { pinnedAt: pin ? new Date() : null },
    });
    return NextResponse.json({ ok: true, pinned: pin });
  }

  if (action === "star") {
    const starred = body.value !== false;
    await prisma.messageThreadParticipant.update({
      where: { id: participant.id },
      data: { starred },
    });
    return NextResponse.json({ ok: true, starred });
  }

  if (action === "mute") {
    const muted = body.value !== false;
    await prisma.messageThreadParticipant.update({
      where: { id: participant.id },
      data: { muted },
    });
    return NextResponse.json({ ok: true, muted });
  }

  if (action === "delete") {
    // Delete-for-me: only this participant's row is touched, so the other side's copy of the
    // conversation is completely unaffected. Moves the thread into this user's Trash; a cron
    // purges it (and hard-deletes the thread once every participant has done the same) after the
    // 14-day window. Restored automatically if a new message lands in the thread.
    await prisma.messageThreadParticipant.update({
      where: { id: participant.id },
      data: { deletedAt: new Date() },
    });
    return NextResponse.json({ ok: true, deleted: true });
  }

  if (action === "restore") {
    await prisma.messageThreadParticipant.update({
      where: { id: participant.id },
      data: { deletedAt: null },
    });
    return NextResponse.json({ ok: true, deleted: false });
  }

  if (action === "block") {
    const blocked = body.value !== false;
    const otherUserId = thread.buyerId === uid ? thread.sellerId : thread.buyerId;
    try {
      await setUserBlocked(prisma, { blockerId: uid, blockedId: otherUserId, blocked });
    } catch (e) {
      if (isUserBlockError(e)) {
        const status = e.code === "USER_NOT_FOUND" ? 404 : 403;
        return NextResponse.json({ error: e.message, code: e.code }, { status });
      }
      throw e;
    }
    await prisma.messageThreadParticipant.update({
      where: { id: participant.id },
      data: { blocked },
    });
    // Per-thread flag stays for backward-compat UI state, but the durable, cross-thread
    // UserBlock table is the actual source of truth for whether new threads/messages
    // between this pair are allowed (see FIX 2, messaging security audit 2026-07).
    return NextResponse.json({ ok: true, blocked });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
