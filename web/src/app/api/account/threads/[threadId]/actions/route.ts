import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
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
    if (thread.sellerId !== uid) {
      return NextResponse.json({ error: "Only the seller can accept requests." }, { status: 403 });
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

  if (action === "block") {
    const blocked = body.value !== false;
    await prisma.messageThreadParticipant.update({
      where: { id: participant.id },
      data: { blocked },
    });
    return NextResponse.json({ ok: true, blocked });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
