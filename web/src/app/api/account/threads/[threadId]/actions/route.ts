import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { isUserBlockError, setUserBlocked } from "@/lib/user-block";
import { purgeAtFor } from "@/lib/message-thread-deletion";
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

  // Delete is per person: it only moves the conversation to THIS user's Deleted area. The other
  // participant keeps their copy. `value: false` restores it. Cleared automatically when a newer
  // message arrives (see threadVisibility).
  if (action === "delete") {
    const del = body.value !== false;
    const now = new Date();
    await prisma.messageThreadParticipant.update({
      where: { id: participant.id },
      data: del ? { deletedAt: now, purgedAt: null } : { deletedAt: null, purgedAt: null },
    });
    if (del) {
      // A deleted conversation must not keep an unread badge alive.
      await prisma.message.updateMany({
        where: { threadId, recipientId: uid, readAt: null },
        data: { readAt: now },
      });
    }
    return NextResponse.json({
      ok: true,
      deleted: del,
      deletedAt: del ? now.toISOString() : null,
      purgeAt: del ? purgeAtFor(now).toISOString() : null,
    });
  }

  // Permanent delete (for this person): only from the Deleted area. Everything up to now is
  // hidden from them for good; the other participant is unaffected.
  if (action === "purge") {
    if (!participant.deletedAt) {
      return NextResponse.json({ error: "Delete the conversation first." }, { status: 400 });
    }
    await prisma.messageThreadParticipant.update({
      where: { id: participant.id },
      data: { purgedAt: new Date() },
    });
    return NextResponse.json({ ok: true, purged: true });
  }

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
