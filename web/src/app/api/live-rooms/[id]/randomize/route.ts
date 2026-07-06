import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { buildAssignments } from "@/lib/break-randomize";
import { getLiveRoomHostAccess, parseTeamLabelsJson } from "@/lib/live-room-host-auth";
import { prisma } from "@/lib/prisma";
import { emitBreakSpotsChanged, emitLiveRoomMessageById, emitVaultRevealSpin } from "@/lib/realtime-emit-server";
import { VAULT_REVEAL_DEFAULT_DURATION_MS } from "@/lib/vault-reveal-spin";

type PostBody = {
  mode?: string;
  /** Admin only: allow new preview/confirm when assignments are locked. */
  overrideAssignmentLock?: boolean;
};

type RandomizationPreview = {
  seed: string;
  assignments: { order: number; label: string }[];
  format: string;
  createdAt: string;
  /** Canonical snapshot of the label set this draw was committed against (FIX 7 round key). */
  labelsKey: string;
};

function parseRandomizationPreview(raw: string | null): RandomizationPreview | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<RandomizationPreview>;
    if (
      typeof parsed.seed === "string" &&
      Array.isArray(parsed.assignments) &&
      typeof parsed.labelsKey === "string"
    ) {
      return parsed as RandomizationPreview;
    }
    return null;
  } catch {
    return null;
  }
}

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
    // FIX 7: commit-then-reveal. Without this, a host could call preview repeatedly — each call
    // re-rolling a brand-new random shuffle — and then confirm whichever result they liked best,
    // undermining the "verified random" claim. The draw is generated ONCE per round (keyed on the
    // current label set: `labelsKey`) and persisted immediately; every subsequent preview call for
    // the SAME round returns the SAME already-committed result. A genuinely new round only starts
    // when the label set changes (host edits team labels) or an admin clears the assignment lock.
    const labelsKey = JSON.stringify(labels);
    const existingPreview = parseRandomizationPreview(room.randomizationPreviewJson);
    if (existingPreview && existingPreview.labelsKey === labelsKey) {
      return NextResponse.json({ ok: true, preview: existingPreview });
    }

    const seed = randomBytes(12).toString("hex");
    const assignments = buildAssignments(labels, seed);
    const preview: RandomizationPreview = {
      seed,
      assignments,
      format: room.breakFormat,
      createdAt: new Date().toISOString(),
      labelsKey,
    };
    await prisma.liveRoom.update({
      where: { id: liveRoomId },
      data: { randomizationPreviewJson: JSON.stringify(preview), randomizationSeed: seed },
    });
    return NextResponse.json({ ok: true, preview });
  }

  /* confirm */
  const previewRaw = room.randomizationPreviewJson;
  if (!previewRaw || !room.randomizationSeed) {
    return NextResponse.json({ error: "Run a preview first." }, { status: 400 });
  }
  const preview = parseRandomizationPreview(previewRaw);
  if (!preview) {
    return NextResponse.json({ error: "Invalid preview state. Run preview again." }, { status: 400 });
  }
  if (!preview.seed || !Array.isArray(preview.assignments)) {
    return NextResponse.json({ error: "Invalid preview payload." }, { status: 400 });
  }

  // FIX 5: the preview was committed against a specific label set (`labelsKey`). If the host edited
  // team labels after preview but before confirm, the stored draw was drawn against a now-stale
  // label universe — reject rather than silently locking in a mismatched assignment.
  const currentLabelsKey = JSON.stringify(labels);
  if (preview.labelsKey !== currentLabelsKey) {
    return NextResponse.json(
      { error: "Labels have changed since preview — please preview again." },
      { status: 409 },
    );
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

  const wheelLabels = labels;
  const firstPick = preview.assignments[0]?.label ?? "";
  const winnerIndex = Math.max(0, wheelLabels.findIndex((l) => l === firstPick));
  emitVaultRevealSpin(liveRoomId, {
    spinId: `pyt-${liveRoomId}-${Date.now()}`,
    kind: "break_pyt",
    title: "PYT randomizer",
    labels: wheelLabels,
    winnerIndex,
    winnerLabel: firstPick || wheelLabels[winnerIndex] || "",
    durationMs: VAULT_REVEAL_DEFAULT_DURATION_MS,
    referenceId: liveRoomId,
    assignments: preview.assignments,
  });

  return NextResponse.json({ ok: true, result: preview });
}
