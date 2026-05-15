import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { buildAssignments } from "@/lib/break-randomize";
import { getLiveRoomHostAccess, parseTeamLabelsJson } from "@/lib/live-room-host-auth";
import { prisma } from "@/lib/prisma";
import { emitBreakSpotsChanged, emitLiveRoomMessageById } from "@/lib/realtime-emit-server";

type PostBody = {
  mode?: string;
  /** Admin only: allow new preview/confirm when assignments are locked. */
  overrideAssignmentLock?: boolean;
};

function labelsFromRoom(room: { breakTeamLabelsJson: string; id: string }): Promise<string[]> {
  const parsed = parseTeamLabelsJson(room.breakTeamLabelsJson);
  if (parsed.length > 0) return Promise.resolve(parsed);
  return prisma.liveRoomItem
    .findMany({
      where: { liveRoomId: room.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { title: true },
    })
    .then((rows) => rows.map((r) => r.title.trim()).filter(Boolean));
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);

  const access = await getLiveRoomHostAccess(liveRoomId, session.user.id, { requireBreak: true });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const mode = typeof body.mode === "string" ? body.mode.trim() : "";
  if (mode !== "preview" && mode !== "confirm") {
    return NextResponse.json({ error: "mode must be preview or confirm." }, { status: 400 });
  }

  const room = await prisma.liveRoom.findUnique({ where: { id: liveRoomId } });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const locked = Boolean(room.assignmentsLockedAt);
  const override = body.overrideAssignmentLock === true && access.isAdmin;
  if (locked && !override) {
    return NextResponse.json(
      { error: "Assignments are locked. An admin may re-run with overrideAssignmentLock: true in the request body." },
      { status: 409 },
    );
  }

  const labels = await labelsFromRoom(room);
  if (labels.length === 0) {
    return NextResponse.json(
      { error: "Add team labels in break settings or add queue items with titles before randomizing." },
      { status: 400 },
    );
  }

  if (mode === "preview") {
    const seed = randomBytes(12).toString("hex");
    const assignments = buildAssignments(labels, seed);
    const payload = JSON.stringify({
      seed,
      assignments,
      format: room.breakFormat,
      createdAt: new Date().toISOString(),
    });
    await prisma.liveRoom.update({
      where: { id: liveRoomId },
      data: { randomizationPreviewJson: payload, randomizationSeed: seed },
    });
    return NextResponse.json({ ok: true, preview: JSON.parse(payload) });
  }

  /* confirm */
  const previewRaw = room.randomizationPreviewJson;
  if (!previewRaw || !room.randomizationSeed) {
    return NextResponse.json({ error: "Run a preview first." }, { status: 400 });
  }
  let preview: { seed?: string; assignments?: { order: number; label: string }[] };
  try {
    preview = JSON.parse(previewRaw) as typeof preview;
  } catch {
    return NextResponse.json({ error: "Invalid preview state. Run preview again." }, { status: 400 });
  }
  if (!preview.seed || !Array.isArray(preview.assignments)) {
    return NextResponse.json({ error: "Invalid preview payload." }, { status: 400 });
  }

  const now = new Date();
  await prisma.liveRoom.update({
    where: { id: liveRoomId },
    data: {
      randomizationResultJson: previewRaw,
      randomizedAt: now,
      randomizationSeed: preview.seed,
      assignmentsLockedAt: now,
    },
  });

  const sysMsg = await prisma.liveRoomMessage.create({
    data: {
      liveRoomId,
      senderId: room.sellerId,
      body: `Randomization confirmed (${preview.assignments.length} spots). Assignments are locked.`,
      messageType: "system",
    },
    select: { id: true },
  });

  void emitLiveRoomMessageById(sysMsg.id);
  emitBreakSpotsChanged(liveRoomId);

  return NextResponse.json({ ok: true, result: preview });
}
