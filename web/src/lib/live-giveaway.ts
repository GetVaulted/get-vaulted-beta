import { createHash, randomBytes } from "crypto";
import type {
  LiveGiveaway,
  LiveGiveawayEntry,
  LiveGiveawayEntryMethod,
  LiveGiveawayKind,
  LiveGiveawayStatus,
  User,
} from "@/generated/prisma/client";
import { scheduledGiveawayEntryCloseAt } from "@/lib/giveaway-countdown";
import { createOrderFromGiveawayWinTx } from "@/lib/live-giveaway-fulfillment";
import {
  isGiveawayEntryEligibleForDraw,
  isWatchEnterGiveawayMethod,
} from "@/lib/live-giveaway-presence";
import { prisma } from "@/lib/prisma";
import { emitLiveRoomGiveawaysChanged, emitPurchaseCompleted, emitVaultRevealSpin } from "@/lib/realtime-emit-server";
import {
  VAULT_REVEAL_DEFAULT_DURATION_MS,
  type VaultRevealSpinPayload,
} from "@/lib/vault-reveal-spin";

export { LIVE_GIVEAWAY_DEFAULT_ENTRY_DURATION_MS } from "@/lib/giveaway-countdown";

export type LiveGiveawayDTO = {
  id: string;
  liveRoomId: string;
  kind: LiveGiveawayKind;
  title: string;
  prizeDescription: string;
  imageUrl: string;
  rulesText: string;
  /** Host-only: discreet AMOE path segment when kind is buyers. */
  amoeRulesSlug: string | null;
  /** Public rules page URL (only in host payloads). */
  amoeRulesUrl: string | null;
  status: LiveGiveawayStatus;
  entryOpenAt: string | null;
  entryCloseAt: string | null;
  drawnAt: string | null;
  winnerUserId: string | null;
  winnerUsername: string | null;
  entryCount: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

/** Buyer-safe giveaway row for live watch UI (open giveaways only on stage). */
export type ViewerGiveawayDTO = {
  id: string;
  kind: LiveGiveawayKind;
  title: string;
  prizeDescription: string;
  imageUrl: string;
  status: LiveGiveawayStatus;
  entryCount: number;
  /** Scheduled draw time while entries are open (5 min default). */
  entryCloseAt: string | null;
  viewerEntered: boolean;
  /** True when this viewer is currently in the active drawing pool (present in room). */
  viewerActiveInDrawing: boolean;
  canEnter: boolean;
};

type GiveawayWithWinner = LiveGiveaway & {
  winnerUser?: Pick<User, "id" | "username"> | null;
};

function buildAmoeRulesUrl(slug: string | null | undefined, siteOrigin: string): string | null {
  if (!slug?.trim()) return null;
  const base = siteOrigin.replace(/\/$/, "");
  return `${base}/promo-entry/${encodeURIComponent(slug.trim())}`;
}

export function serializeLiveGiveaway(
  row: GiveawayWithWinner,
  opts?: { includeHostSecrets?: boolean; siteOrigin?: string },
): LiveGiveawayDTO {
  const includeHost = opts?.includeHostSecrets === true;
  const origin = opts?.siteOrigin?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim() || "";
  const slug = includeHost ? row.amoeRulesSlug : null;
  return {
    id: row.id,
    liveRoomId: row.liveRoomId,
    kind: row.kind,
    title: row.title,
    prizeDescription: row.prizeDescription,
    imageUrl: row.imageUrl,
    rulesText: includeHost ? row.rulesText : row.rulesText ? "[Official rules on file]" : "",
    amoeRulesSlug: slug,
    amoeRulesUrl: includeHost && origin ? buildAmoeRulesUrl(row.amoeRulesSlug, origin) : null,
    status: row.status,
    entryOpenAt: row.entryOpenAt?.toISOString() ?? null,
    entryCloseAt: row.entryCloseAt?.toISOString() ?? null,
    drawnAt: row.drawnAt?.toISOString() ?? null,
    winnerUserId: row.winnerUserId,
    winnerUsername: row.winnerUser?.username?.trim() || null,
    entryCount: row.entryCount,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function generateAmoeRulesSlug(): string {
  return `pe-${randomBytes(18).toString("base64url")}`;
}

function parseKind(raw: unknown): LiveGiveawayKind | null {
  if (raw === "open" || raw === "buyers") return raw;
  return null;
}

export async function listLiveGiveawaysForRoom(liveRoomId: string, includeHostSecrets = false) {
  await processExpiredLiveGiveaways(liveRoomId);
  const rows = await prisma.liveGiveaway.findMany({
    where: { liveRoomId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { winnerUser: { select: { id: true, username: true } } },
  });
  return rows.map((r) => serializeLiveGiveaway(r, { includeHostSecrets }));
}

/** Open giveaways with entries open — shown on buyer watch UI (not buyers-only promos). */
export async function listViewerGiveawaysForRoom(liveRoomId: string, viewerUserId?: string | null) {
  await processExpiredLiveGiveaways(liveRoomId);
  const rows = await prisma.liveGiveaway.findMany({
    where: { liveRoomId, kind: "open", status: "entries_open" },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  if (rows.length === 0) return [];

  let enteredByGiveaway = new Map<string, { activeInRoom: boolean }>();
  if (viewerUserId) {
    const entries = await prisma.liveGiveawayEntry.findMany({
      where: { userId: viewerUserId, giveawayId: { in: rows.map((r) => r.id) } },
      select: { giveawayId: true, activeInRoom: true },
    });
    enteredByGiveaway = new Map(entries.map((e) => [e.giveawayId, { activeInRoom: e.activeInRoom }]));
  }

  return rows.map(
    (r): ViewerGiveawayDTO => {
      const entry = enteredByGiveaway.get(r.id);
      const viewerEntered = Boolean(entry);
      const viewerActiveInDrawing = viewerEntered
        ? entry!.activeInRoom
        : false;
      return {
        id: r.id,
        kind: r.kind,
        title: r.title,
        prizeDescription: r.prizeDescription,
        imageUrl: r.imageUrl,
        status: r.status,
        entryCount: r.entryCount,
        entryCloseAt: r.entryCloseAt?.toISOString() ?? null,
        viewerEntered,
        viewerActiveInDrawing,
        canEnter: !viewerEntered,
      };
    },
  );
}

/** Silent buyers-giveaway entry after a successful in-room purchase. */
export async function recordBuyerGiveawayPurchaseEntries(
  liveRoomId: string,
  userId: string,
  purchaseRef: string,
): Promise<{ entered: number }> {
  await processExpiredLiveGiveaways(liveRoomId);

  const promos = await prisma.liveGiveaway.findMany({
    where: { liveRoomId, kind: "buyers", status: "entries_open" },
    select: { id: true, entryCloseAt: true },
  });
  if (promos.length === 0) return { entered: 0 };

  let entered = 0;
  const now = new Date();
  for (const promo of promos) {
    if (promo.entryCloseAt && promo.entryCloseAt <= now) continue;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.liveGiveawayEntry.create({
          data: {
            giveawayId: promo.id,
            userId,
            method: "purchase",
            purchaseRef,
          },
        });
        await tx.liveGiveaway.update({
          where: { id: promo.id },
          data: { entryCount: { increment: 1 } },
        });
      });
      entered++;
    } catch (e) {
      if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
        continue;
      }
      throw e;
    }
  }
  if (entered > 0) emitLiveRoomGiveawaysChanged(liveRoomId);
  return { entered };
}

export async function createLiveGiveaway(input: {
  liveRoomId: string;
  createdById: string;
  kind: LiveGiveawayKind;
  title: string;
  prizeDescription?: string;
  imageUrl?: string;
  rulesText?: string;
  openEntries?: boolean;
}) {
  const title = input.title.trim();
  if (!title) return { ok: false as const, error: "Title is required." };
  if (title.length > 200) return { ok: false as const, error: "Title is too long." };

  const prizeDescription = (input.prizeDescription ?? "").trim().slice(0, 2000);
  const imageUrl = (input.imageUrl ?? "").trim().slice(0, 2000);
  const rulesText = (input.rulesText ?? "").trim().slice(0, 12000);

  if (input.kind === "buyers" && rulesText.length < 80) {
    return {
      ok: false as const,
      error: "Buyers giveaways require official promotion rules (at least 80 characters).",
    };
  }

  const maxSort = await prisma.liveGiveaway.aggregate({
    where: { liveRoomId: input.liveRoomId },
    _max: { sortOrder: true },
  });
  const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

  const amoeRulesSlug = input.kind === "buyers" ? generateAmoeRulesSlug() : null;
  const openNow = input.openEntries === true;
  const entryOpenAt = openNow ? new Date() : null;

  const row = await prisma.liveGiveaway.create({
    data: {
      liveRoomId: input.liveRoomId,
      createdById: input.createdById,
      kind: input.kind,
      title,
      prizeDescription,
      imageUrl,
      rulesText,
      amoeRulesSlug,
      sortOrder,
      status: openNow ? "entries_open" : "draft",
      entryOpenAt,
      entryCloseAt: entryOpenAt ? scheduledGiveawayEntryCloseAt(entryOpenAt) : null,
    },
    include: { winnerUser: { select: { id: true, username: true } } },
  });

  return { ok: true as const, giveaway: serializeLiveGiveaway(row, { includeHostSecrets: true }) };
}

type GiveawayDrawEntry = {
  userId: string;
  user: { username: string | null };
  method: LiveGiveawayEntryMethod;
  activeInRoom: boolean;
};

async function loadGiveawayDrawEntries(giveawayId: string): Promise<GiveawayDrawEntry[]> {
  const rows = await prisma.liveGiveawayEntry.findMany({
    where: { giveawayId },
    select: {
      userId: true,
      method: true,
      activeInRoom: true,
      user: { select: { username: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.filter(isGiveawayEntryEligibleForDraw);
}

async function executeGiveawayDraw(
  row: GiveawayWithWinner,
  liveRoomId: string,
  entries: GiveawayDrawEntry[],
): Promise<{ giveaway: LiveGiveawayDTO; spin: VaultRevealSpinPayload }> {
  const drawSeed = `${row.id}:${Date.now()}:${randomBytes(8).toString("hex")}`;
  const hash = createHash("sha256").update(drawSeed).digest();
  const pick = hash.readUInt32BE(0) % entries.length;
  const winnerUserId = entries[pick]!.userId;

  const labels = entries.map((e) => e.user.username?.trim() || "entrant");
  const winnerIndex = entries.findIndex((e) => e.userId === winnerUserId);
  const spin: VaultRevealSpinPayload = {
    spinId: `giveaway-${row.id}-${Date.now()}`,
    kind: "giveaway",
    title: row.title,
    labels,
    winnerIndex: Math.max(0, winnerIndex),
    winnerLabel: labels[Math.max(0, winnerIndex)] ?? "winner",
    durationMs: VAULT_REVEAL_DEFAULT_DURATION_MS,
    referenceId: row.id,
  };

  const updated = await prisma.$transaction(async (tx) => {
    const updatedGiveaway = await tx.liveGiveaway.update({
      where: { id: row.id },
      data: {
        status: "drawn",
        drawnAt: new Date(),
        drawSeed,
        winnerUserId,
        entryCloseAt: row.entryCloseAt ?? new Date(),
      },
      include: { winnerUser: { select: { id: true, username: true } } },
    });
    spin.winnerLabel =
      updatedGiveaway.winnerUser?.username?.trim() || spin.winnerLabel;
    return updatedGiveaway;
  });

  emitVaultRevealSpin(liveRoomId, spin);

  let orderId: string | null = updated.fulfillmentOrderId;
  if (!orderId && updated.winnerUserId) {
    try {
      orderId = await prisma.$transaction(async (tx) => {
        const room = await tx.liveRoom.findUnique({
          where: { id: liveRoomId },
          select: { sellerId: true },
        });
        if (!room) throw new Error("Room not found.");
        return createOrderFromGiveawayWinTx(tx, {
          giveaway: {
            id: updated.id,
            liveRoomId: updated.liveRoomId,
            title: updated.title,
            prizeDescription: updated.prizeDescription,
            imageUrl: updated.imageUrl,
            fulfillmentOrderId: updated.fulfillmentOrderId,
            winnerUserId: updated.winnerUserId!,
            winnerUser: updated.winnerUser,
          },
          sellerId: room.sellerId,
        });
      });
    } catch (e) {
      console.error("giveaway fulfillment order failed after draw", {
        giveawayId: row.id,
        liveRoomId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (orderId && updated.winnerUserId) {
    const roomNext = await prisma.liveRoom.findUnique({
      where: { id: liveRoomId },
      select: { roomVersion: true },
    });
    emitPurchaseCompleted(liveRoomId, `giveaway:${row.id}`, {
      roomVersion: roomNext?.roomVersion ?? undefined,
      winnerUsername: updated.winnerUser?.username ?? null,
      winnerId: updated.winnerUserId,
      winningAmountUsd: 0,
      itemTitle: row.title,
      orderId,
      paymentStatus: "paid",
    });
  }

  return {
    giveaway: serializeLiveGiveaway(updated, { includeHostSecrets: true }),
    spin,
  };
}

/** Auto-close or auto-draw giveaways whose 5-minute entry window has ended. */
export async function processExpiredLiveGiveaways(liveRoomId: string): Promise<number> {
  const now = new Date();
  const due = await prisma.liveGiveaway.findMany({
    where: {
      liveRoomId,
      status: "entries_open",
      entryCloseAt: { not: null, lte: now },
    },
    include: { winnerUser: { select: { id: true, username: true } } },
    orderBy: { entryCloseAt: "asc" },
  });
  if (due.length === 0) return 0;

  let processed = 0;
  for (const row of due) {
    if (row.entryCount <= 0) {
      await prisma.liveGiveaway.update({
        where: { id: row.id },
        data: { status: "entries_closed", entryCloseAt: now },
      });
      processed++;
      continue;
    }
    const entries = await loadGiveawayDrawEntries(row.id);
    if (entries.length === 0) {
      await prisma.liveGiveaway.update({
        where: { id: row.id },
        data: { status: "entries_closed", entryCloseAt: now },
      });
      processed++;
      continue;
    }
    await executeGiveawayDraw(row, liveRoomId, entries);
    processed++;
  }

  if (processed > 0) emitLiveRoomGiveawaysChanged(liveRoomId);
  return processed;
}

export async function patchLiveGiveawayStatus(
  giveawayId: string,
  liveRoomId: string,
  action: "open_entries" | "close_entries" | "cancel" | "draw",
) {
  await processExpiredLiveGiveaways(liveRoomId);

  const row = await prisma.liveGiveaway.findFirst({
    where: { id: giveawayId, liveRoomId },
    include: { winnerUser: { select: { id: true, username: true } } },
  });
  if (!row) return { ok: false as const, error: "Giveaway not found." };

  if (action === "open_entries") {
    if (row.status !== "draft" && row.status !== "entries_closed") {
      return { ok: false as const, error: "Entries can only open from draft or after closing." };
    }
    const openAt = row.status === "entries_closed" ? new Date() : (row.entryOpenAt ?? new Date());
    const updated = await prisma.liveGiveaway.update({
      where: { id: row.id },
      data: {
        status: "entries_open",
        entryOpenAt: openAt,
        entryCloseAt: scheduledGiveawayEntryCloseAt(openAt),
      },
      include: { winnerUser: { select: { id: true, username: true } } },
    });
    return { ok: true as const, giveaway: serializeLiveGiveaway(updated, { includeHostSecrets: true }) };
  }

  if (action === "close_entries") {
    if (row.status !== "entries_open") {
      return { ok: false as const, error: "Entries are not open." };
    }
    const updated = await prisma.liveGiveaway.update({
      where: { id: row.id },
      data: { status: "entries_closed", entryCloseAt: new Date() },
      include: { winnerUser: { select: { id: true, username: true } } },
    });
    return { ok: true as const, giveaway: serializeLiveGiveaway(updated, { includeHostSecrets: true }) };
  }

  if (action === "cancel") {
    if (row.status === "drawn") return { ok: false as const, error: "Cannot cancel after drawing." };
    const updated = await prisma.liveGiveaway.update({
      where: { id: row.id },
      data: { status: "cancelled" },
      include: { winnerUser: { select: { id: true, username: true } } },
    });
    return { ok: true as const, giveaway: serializeLiveGiveaway(updated, { includeHostSecrets: true }) };
  }

  if (action === "draw") {
    if (row.status !== "entries_closed" && row.status !== "entries_open") {
      return { ok: false as const, error: "Close entries before drawing, or draw while entries are open." };
    }
    const entries = await loadGiveawayDrawEntries(row.id);
    if (entries.length === 0) {
      const pausedWatchEnter = await prisma.liveGiveawayEntry.count({
        where: { giveawayId: row.id, method: "watch_enter", activeInRoom: false },
      });
      if (pausedWatchEnter > 0) {
        return {
          ok: false as const,
          error:
            "No active entrants in the room. Viewers who left must return and tap Enter again before you can draw.",
        };
      }
      return { ok: false as const, error: "No entries to draw from." };
    }

    const drawn = await executeGiveawayDraw(row, liveRoomId, entries);
    return { ok: true as const, giveaway: drawn.giveaway, spin: drawn.spin };
  }

  return { ok: false as const, error: "Unknown action." };
}

export async function deleteLiveGiveaway(giveawayId: string, liveRoomId: string) {
  const row = await prisma.liveGiveaway.findFirst({ where: { id: giveawayId, liveRoomId } });
  if (!row) return { ok: false as const, error: "Giveaway not found." };
  if (row.status === "drawn") return { ok: false as const, error: "Cannot delete after a winner is drawn." };
  await prisma.liveGiveaway.delete({ where: { id: row.id } });
  return { ok: true as const };
}

export type LiveGiveawayEntryDTO = {
  userId: string;
  username: string;
};

/** Host-only: entrant list for draw wheel UI (order matches server draw pool). */
export async function listLiveGiveawayEntriesForHost(giveawayId: string, liveRoomId: string) {
  const row = await prisma.liveGiveaway.findFirst({ where: { id: giveawayId, liveRoomId } });
  if (!row) return { ok: false as const, error: "Giveaway not found." };
  if (row.status === "drawn") return { ok: false as const, error: "Winner already drawn." };

  const entries = await prisma.liveGiveawayEntry.findMany({
    where: { giveawayId: row.id },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, username: true } } },
  });

  return {
    ok: true as const,
    entries: entries.map((e) => ({
      userId: e.userId,
      username: e.user.username?.trim() || "entrant",
    })),
  };
}

export async function pauseOpenGiveawayPresence(
  liveRoomId: string,
  userId: string,
): Promise<{ paused: number }> {
  await processExpiredLiveGiveaways(liveRoomId);

  const openGiveaways = await prisma.liveGiveaway.findMany({
    where: { liveRoomId, kind: "open", status: "entries_open" },
    select: { id: true },
  });
  if (openGiveaways.length === 0) return { paused: 0 };

  let paused = 0;
  for (const giveaway of openGiveaways) {
    const entry = await prisma.liveGiveawayEntry.findUnique({
      where: { giveawayId_userId: { giveawayId: giveaway.id, userId } },
      select: { id: true, method: true, activeInRoom: true },
    });
    if (!entry || !isWatchEnterGiveawayMethod(entry.method) || !entry.activeInRoom) continue;

    const didPause = await prisma.$transaction(async (tx) => {
      const updated = await tx.liveGiveawayEntry.updateMany({
        where: { id: entry.id, activeInRoom: true },
        data: { activeInRoom: false },
      });
      if (updated.count === 0) return false;
      await tx.liveGiveaway.update({
        where: { id: giveaway.id },
        data: { entryCount: { decrement: 1 } },
      });
      return true;
    });
    if (didPause) paused++;
  }

  if (paused > 0) emitLiveRoomGiveawaysChanged(liveRoomId);
  return { paused };
}

export async function resumeOpenGiveawayPresence(
  liveRoomId: string,
  userId: string,
): Promise<{ resumed: number }> {
  await processExpiredLiveGiveaways(liveRoomId);

  const openGiveaways = await prisma.liveGiveaway.findMany({
    where: { liveRoomId, kind: "open", status: "entries_open" },
    select: { id: true, entryCloseAt: true },
  });
  if (openGiveaways.length === 0) return { resumed: 0 };

  const now = new Date();
  let resumed = 0;
  for (const giveaway of openGiveaways) {
    if (giveaway.entryCloseAt && giveaway.entryCloseAt <= now) continue;

    const entry = await prisma.liveGiveawayEntry.findUnique({
      where: { giveawayId_userId: { giveawayId: giveaway.id, userId } },
      select: { id: true, method: true, activeInRoom: true },
    });
    if (!entry || !isWatchEnterGiveawayMethod(entry.method) || entry.activeInRoom) continue;

    const didResume = await prisma.$transaction(async (tx) => {
      const updated = await tx.liveGiveawayEntry.updateMany({
        where: { id: entry.id, activeInRoom: false },
        data: { activeInRoom: true },
      });
      if (updated.count === 0) return false;
      await tx.liveGiveaway.update({
        where: { id: giveaway.id },
        data: { entryCount: { increment: 1 } },
      });
      return true;
    });
    if (didResume) resumed++;
  }

  if (resumed > 0) emitLiveRoomGiveawaysChanged(liveRoomId);
  return { resumed };
}

export async function enterOpenGiveaway(giveawayId: string, liveRoomId: string, userId: string) {
  await processExpiredLiveGiveaways(liveRoomId);

  const row = await prisma.liveGiveaway.findFirst({ where: { id: giveawayId, liveRoomId } });
  if (!row) return { ok: false as const, error: "Giveaway not found." };
  if (row.kind !== "open") return { ok: false as const, error: "This giveaway is not open-entry." };
  if (row.status !== "entries_open") return { ok: false as const, error: "Entries are not open." };
  if (row.entryCloseAt && row.entryCloseAt <= new Date()) {
    return { ok: false as const, error: "Entry window has ended." };
  }

  const existing = await prisma.liveGiveawayEntry.findUnique({
    where: { giveawayId_userId: { giveawayId: row.id, userId } },
    select: { id: true, method: true, activeInRoom: true },
  });
  if (existing) {
    if (!isWatchEnterGiveawayMethod(existing.method)) {
      return { ok: false as const, error: "You are already entered." };
    }
    if (existing.activeInRoom) {
      return { ok: false as const, error: "You are already entered." };
    }
    await prisma.$transaction(async (tx) => {
      const updated = await tx.liveGiveawayEntry.updateMany({
        where: { id: existing.id, activeInRoom: false },
        data: { activeInRoom: true },
      });
      if (updated.count === 0) return;
      await tx.liveGiveaway.update({
        where: { id: row.id },
        data: { entryCount: { increment: 1 } },
      });
    });
    emitLiveRoomGiveawaysChanged(liveRoomId);
    return { ok: true as const };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.liveGiveawayEntry.create({
        data: {
          giveawayId: row.id,
          userId,
          method: "watch_enter",
          activeInRoom: true,
        },
      });
      await tx.liveGiveaway.update({
        where: { id: row.id },
        data: { entryCount: { increment: 1 } },
      });
    });
    emitLiveRoomGiveawaysChanged(liveRoomId);
    return { ok: true as const };
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      return { ok: false as const, error: "You are already entered." };
    }
    throw e;
  }
}

export async function submitAmoeGiveawayEntry(input: {
  rulesSlug: string;
  userId: string;
  fullName: string;
  email: string;
  mailingAddress: string;
}) {
  const slug = input.rulesSlug.trim();
  if (!slug) return { ok: false as const, error: "Invalid promotion." };

  const row = await prisma.liveGiveaway.findFirst({
    where: { amoeRulesSlug: slug, kind: "buyers", status: "entries_open" },
    include: { liveRoom: { select: { id: true } } },
  });
  if (!row) return { ok: false as const, error: "This promotion is not accepting entries." };
  if (row.entryCloseAt && row.entryCloseAt <= new Date()) {
    await processExpiredLiveGiveaways(row.liveRoomId);
    return { ok: false as const, error: "This promotion is not accepting entries." };
  }

  const amoeMeta = {
    fullName: input.fullName.trim().slice(0, 200),
    email: input.email.trim().slice(0, 320),
    mailingAddress: input.mailingAddress.trim().slice(0, 2000),
    submittedAt: new Date().toISOString(),
  };
  if (!amoeMeta.fullName || !amoeMeta.email || amoeMeta.mailingAddress.length < 10) {
    return { ok: false as const, error: "Complete all fields to submit a no-purchase entry." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.liveGiveawayEntry.create({
        data: {
          giveawayId: row.id,
          userId: input.userId,
          method: "amoe_form",
          amoeMeta,
        },
      });
      await tx.liveGiveaway.update({
        where: { id: row.id },
        data: { entryCount: { increment: 1 } },
      });
    });
    return { ok: true as const };
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      return { ok: false as const, error: "You already have an entry for this promotion." };
    }
    throw e;
  }
}

export async function getGiveawayByAmoeSlug(rulesSlug: string) {
  const row = await prisma.liveGiveaway.findFirst({
    where: { amoeRulesSlug: rulesSlug.trim() },
    include: {
      liveRoom: { select: { id: true, title: true, status: true, seller: { select: { username: true } } } },
    },
  });
  if (!row || row.kind !== "buyers") return null;
  return {
    id: row.id,
    liveRoomId: row.liveRoomId,
    title: row.title,
    prizeDescription: row.prizeDescription,
    rulesText: row.rulesText,
    status: row.status,
    roomTitle: row.liveRoom.title,
    roomStatus: row.liveRoom.status,
    sellerUsername: row.liveRoom.seller.username,
    entriesOpen: row.status === "entries_open",
  };
}

export function parseCreateGiveawayBody(body: unknown): {
  kind: LiveGiveawayKind;
  title: string;
  prizeDescription: string;
  imageUrl: string;
  rulesText: string;
  openEntries: boolean;
} | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const kind = parseKind(o.kind);
  if (!kind) return null;
  const title = typeof o.title === "string" ? o.title.trim() : "";
  if (!title) return null;
  return {
    kind,
    title,
    prizeDescription: typeof o.prizeDescription === "string" ? o.prizeDescription.trim() : "",
    imageUrl: typeof o.imageUrl === "string" ? o.imageUrl.trim() : "",
    rulesText: typeof o.rulesText === "string" ? o.rulesText.trim() : "",
    openEntries: o.openEntries === true,
  };
}

export type { LiveGiveawayEntryMethod };
