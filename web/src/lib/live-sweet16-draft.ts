import { randomBytes } from "crypto";
import { Prisma } from "@/generated/prisma/client";
import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import { prisma } from "@/lib/prisma";
import { NFL_TEAMS_PRESET } from "@/lib/live-item-variant-presets";
import {
  emitSweet16DraftComplete,
  emitSweet16DraftPickMade,
  emitSweet16DraftStarted,
} from "@/lib/realtime-emit-server";

/** Default seconds each buyer gets to pick on their turn before auto-assignment kicks in. */
export const SWEET16_DEFAULT_TURN_SECONDS = 60;

/** Draw attempts before giving up on a single auto-assign call (same bias as random-reveal). */
const MAX_AUTO_ASSIGN_ATTEMPTS = 8;

export const NFL_SWEET16_TEAM_POOL: { label: string; abbr: string }[] = NFL_TEAMS_PRESET.map((t) => ({
  label: t.label,
  abbr: t.abbr ?? t.label,
}));

function isUniqueConstraintError(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

function shuffledCopy<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const rand = randomBytes(4).readUInt32BE(0) / 0xffffffff;
    const j = Math.floor(rand * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function abbrForTeamLabel(label: string): string {
  return NFL_SWEET16_TEAM_POOL.find((t) => t.label === label)?.abbr ?? label.slice(0, 3).toUpperCase();
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

export type Sweet16DraftDto = {
  itemId: string;
  liveRoomId: string;
  status: "not_started" | "in_progress" | "complete";
  turnOrder: string[];
  currentTurnIndex: number | null;
  currentTurnPurchaseId: string | null;
  currentTurnBuyerUsername: string | null;
  currentTurnDeadlineAt: string | null;
  remainingTeamLabels: string[];
  turnSeconds: number;
  startedAt: string | null;
  completedAt: string | null;
  /** The requesting viewer's own purchase id for this item, when known — lets the client tell
   *  "it's my turn" apart from "it's someone else's turn" without trusting a client-side guess. */
  viewerPurchaseId: string | null;
  picks: Array<{
    purchaseId: string;
    turnIndex: number;
    teamLabel: string;
    teamAbbr: string;
    autoAssigned: boolean;
    buyerUsername: string | null;
  }>;
};

async function toDraftDto(
  draft: {
    liveRoomItemId: string;
    liveRoomId: string;
    status: string;
    turnOrder: unknown;
    currentTurnIndex: number | null;
    currentTurnPurchaseId: string | null;
    currentTurnDeadlineAt: Date | null;
    remainingTeamLabels: unknown;
    turnSeconds: number;
    startedAt: Date | null;
    completedAt: Date | null;
  },
  db: typeof prisma | TransactionClient = prisma,
  viewerUserId?: string | null,
): Promise<Sweet16DraftDto> {
  const picks = await db.liveSweet16DraftPick.findMany({
    where: { draftId: draft.liveRoomItemId },
    include: { purchase: { include: { buyer: { select: { username: true } } } } },
    orderBy: { turnIndex: "asc" },
  });
  let currentTurnBuyerUsername: string | null = null;
  if (draft.currentTurnPurchaseId) {
    const currentPurchase = await db.liveItemVariantPurchase.findUnique({
      where: { id: draft.currentTurnPurchaseId },
      select: { buyer: { select: { username: true } } },
    });
    currentTurnBuyerUsername = currentPurchase?.buyer?.username ?? null;
  }
  let viewerPurchaseId: string | null = null;
  if (viewerUserId) {
    const viewerPurchase = await db.liveItemVariantPurchase.findFirst({
      where: { liveRoomItemId: draft.liveRoomItemId, buyerId: viewerUserId, paymentStatus: "paid" },
      select: { id: true },
    });
    viewerPurchaseId = viewerPurchase?.id ?? null;
  }
  return {
    itemId: draft.liveRoomItemId,
    liveRoomId: draft.liveRoomId,
    status: draft.status as Sweet16DraftDto["status"],
    turnOrder: asStringArray(draft.turnOrder),
    currentTurnIndex: draft.currentTurnIndex,
    currentTurnPurchaseId: draft.currentTurnPurchaseId,
    currentTurnBuyerUsername,
    currentTurnDeadlineAt: draft.currentTurnDeadlineAt?.toISOString() ?? null,
    remainingTeamLabels: asStringArray(draft.remainingTeamLabels),
    turnSeconds: draft.turnSeconds,
    startedAt: draft.startedAt?.toISOString() ?? null,
    completedAt: draft.completedAt?.toISOString() ?? null,
    viewerPurchaseId,
    picks: picks.map((p) => ({
      purchaseId: p.purchaseId,
      turnIndex: p.turnIndex,
      teamLabel: p.teamLabel,
      teamAbbr: p.teamAbbr,
      autoAssigned: p.autoAssigned,
      buyerUsername: p.purchase.buyer?.username ?? null,
    })),
  };
}

export async function getSweet16DraftDto(
  itemId: string,
  viewerUserId?: string | null,
): Promise<Sweet16DraftDto | null> {
  // Opportunistic: resolve any turn whose deadline has already passed before returning state, so
  // a buyer who reconnects (or just polls) never sees a stuck/expired turn waiting on the cron.
  await autoAssignSweet16Turn(itemId);
  const draft = await prisma.liveSweet16Draft.findUnique({ where: { liveRoomItemId: itemId } });
  if (!draft) return null;
  return toDraftDto(draft, prisma, viewerUserId);
}

export class Sweet16Error extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * Host starts the draft once all 16 blind slots are sold (`variantBreakReadyAt` set). Builds a
 * crypto-shuffled turn order from the 16 paid purchases and opens the first turn.
 */
export async function startSweet16Draft(args: { liveRoomId: string; itemId: string }): Promise<Sweet16DraftDto> {
  const { liveRoomId, itemId } = args;

  const item = await prisma.liveRoomItem.findFirst({
    where: { id: itemId, liveRoomId },
    select: {
      id: true,
      liveRoomId: true,
      variantAssignmentMode: true,
      variantBreakReadyAt: true,
      variants: { select: { id: true } },
    },
  });
  if (!item) throw new Sweet16Error("ITEM_NOT_FOUND", "Item not found.", 404);
  if (item.variantAssignmentMode !== "draft") {
    throw new Sweet16Error("NOT_A_SWEET16_ITEM", "This lot is not a Sweet 16 break.", 400);
  }
  if (!item.variantBreakReadyAt) {
    throw new Sweet16Error("NOT_READY", "All 16 slots must be sold before starting the draft.", 409);
  }

  const existing = await prisma.liveSweet16Draft.findUnique({ where: { liveRoomItemId: itemId } });
  if (existing) {
    if (existing.status !== "not_started") {
      throw new Sweet16Error("ALREADY_STARTED", "This draft has already started.", 409);
    }
  }

  const variantIds = item.variants.map((v) => v.id);
  const paidPurchases = await prisma.liveItemVariantPurchase.findMany({
    where: { variantId: { in: variantIds }, paymentStatus: "paid" },
    select: { id: true, variantId: true },
  });
  if (paidPurchases.length === 0) {
    throw new Sweet16Error("NO_PAID_SLOTS", "No paid slots found for this break.", 409);
  }

  const turnOrder = shuffledCopy(paidPurchases.map((p) => p.id));
  const remainingTeamLabels = NFL_SWEET16_TEAM_POOL.map((t) => t.label);
  const now = new Date();
  const turnSeconds = SWEET16_DEFAULT_TURN_SECONDS;
  const deadline = new Date(now.getTime() + turnSeconds * 1000);

  const draft = await prisma.liveSweet16Draft.upsert({
    where: { liveRoomItemId: itemId },
    create: {
      liveRoomItemId: itemId,
      liveRoomId,
      status: "in_progress",
      turnOrder,
      currentTurnIndex: 0,
      currentTurnPurchaseId: turnOrder[0]!,
      currentTurnDeadlineAt: deadline,
      remainingTeamLabels,
      turnSeconds,
      startedAt: now,
    },
    update: {
      status: "in_progress",
      turnOrder,
      currentTurnIndex: 0,
      currentTurnPurchaseId: turnOrder[0]!,
      currentTurnDeadlineAt: deadline,
      remainingTeamLabels,
      turnSeconds,
      startedAt: now,
      completedAt: null,
    },
  });

  const dto = await toDraftDto(draft);
  emitSweet16DraftStarted(liveRoomId, {
    itemId,
    turnOrder,
    currentTurnIndex: 0,
    currentTurnPurchaseId: turnOrder[0]!,
    currentTurnDeadlineAt: deadline.toISOString(),
    remainingTeamLabels,
    turnSeconds,
  });
  return dto;
}

/** Shared transactional pick — used by both the buyer's manual pick and the timeout auto-assign. */
async function applyDraftPick(args: {
  itemId: string;
  liveRoomId: string;
  purchaseId: string;
  turnIndex: number;
  teamLabel: string;
  autoAssigned: boolean;
}): Promise<{ dto: Sweet16DraftDto; completed: boolean }> {
  const teamAbbr = abbrForTeamLabel(args.teamLabel);

  const completed = await prisma.$transaction(async (tx) => {
    // Guarded by @@unique([draftId, teamLabel]) — a concurrent writer for the same label fails here.
    await tx.liveSweet16DraftPick.create({
      data: {
        draftId: args.itemId,
        liveRoomId: args.liveRoomId,
        purchaseId: args.purchaseId,
        turnIndex: args.turnIndex,
        teamLabel: args.teamLabel,
        teamAbbr,
        autoAssigned: args.autoAssigned,
      },
    });
    // Guarded by the pre-existing @@unique([liveRoomItemId, revealedLabel]) on the purchase.
    await tx.liveItemVariantPurchase.update({
      where: { id: args.purchaseId },
      data: { revealedLabel: args.teamLabel, revealedAbbr: teamAbbr },
    });

    const draft = await tx.liveSweet16Draft.findUniqueOrThrow({ where: { liveRoomItemId: args.itemId } });
    const turnOrder = asStringArray(draft.turnOrder);
    const remaining = asStringArray(draft.remainingTeamLabels).filter((l) => l !== args.teamLabel);
    const nextIndex = args.turnIndex + 1;

    if (nextIndex < turnOrder.length) {
      await tx.liveSweet16Draft.update({
        where: { liveRoomItemId: args.itemId },
        data: {
          currentTurnIndex: nextIndex,
          currentTurnPurchaseId: turnOrder[nextIndex]!,
          currentTurnDeadlineAt: new Date(Date.now() + draft.turnSeconds * 1000),
          remainingTeamLabels: remaining,
        },
      });
      return false;
    }

    await tx.liveSweet16Draft.update({
      where: { liveRoomItemId: args.itemId },
      data: {
        status: "complete",
        currentTurnIndex: null,
        currentTurnPurchaseId: null,
        currentTurnDeadlineAt: null,
        remainingTeamLabels: remaining,
        completedAt: new Date(),
      },
    });
    return true;
  });

  const finalDraft = await prisma.liveSweet16Draft.findUniqueOrThrow({ where: { liveRoomItemId: args.itemId } });
  const dto = await toDraftDto(finalDraft);

  const pickPayload = {
    itemId: args.itemId,
    purchaseId: args.purchaseId,
    teamLabel: args.teamLabel,
    teamAbbr,
    turnIndex: args.turnIndex,
    autoAssigned: args.autoAssigned,
    nextTurnPurchaseId: dto.currentTurnPurchaseId,
    nextTurnDeadlineAt: dto.currentTurnDeadlineAt,
    complete: completed,
  };
  if (completed) {
    emitSweet16DraftComplete(args.liveRoomId, pickPayload);
  } else {
    emitSweet16DraftPickMade(args.liveRoomId, pickPayload);
  }
  return { dto, completed };
}

/**
 * Buyer picks a team on their own turn. Server-validates turn ownership and the deadline — the
 * client hiding the picker for non-current buyers is a nicety only, never the real gate.
 */
export async function makeSweet16DraftPick(args: {
  liveRoomId: string;
  itemId: string;
  buyerUserId: string;
  teamLabel: string;
}): Promise<Sweet16DraftDto> {
  const draft = await prisma.liveSweet16Draft.findUnique({ where: { liveRoomItemId: args.itemId } });
  if (!draft || draft.liveRoomId !== args.liveRoomId) {
    throw new Sweet16Error("DRAFT_NOT_FOUND", "This draft has not started.", 404);
  }
  if (draft.status !== "in_progress") {
    throw new Sweet16Error("DRAFT_NOT_ACTIVE", "This draft is not currently active.", 409);
  }
  if (!draft.currentTurnDeadlineAt || draft.currentTurnDeadlineAt.getTime() <= Date.now()) {
    // Resolve the overdue turn now (auto-assign) so state doesn't stall waiting on cron, then
    // reject this caller's now-stale pick attempt.
    await autoAssignSweet16Turn(args.itemId);
    throw new Sweet16Error("TURN_EXPIRED", "Your turn timed out.", 409);
  }

  const purchase = await prisma.liveItemVariantPurchase.findFirst({
    where: { liveRoomItemId: args.itemId, buyerId: args.buyerUserId, paymentStatus: "paid" },
    select: { id: true },
  });
  if (!purchase) {
    throw new Sweet16Error("NOT_A_PARTICIPANT", "You don't have a paid slot in this break.", 403);
  }
  if (purchase.id !== draft.currentTurnPurchaseId) {
    throw new Sweet16Error("NOT_YOUR_TURN", "It's not your turn yet.", 409);
  }

  const teamLabel = args.teamLabel.trim();
  const remaining = asStringArray(draft.remainingTeamLabels);
  if (!remaining.includes(teamLabel)) {
    throw new Sweet16Error("INVALID_TEAM", "That team is not available.", 400);
  }

  try {
    const { dto } = await applyDraftPick({
      itemId: args.itemId,
      liveRoomId: args.liveRoomId,
      purchaseId: purchase.id,
      turnIndex: draft.currentTurnIndex ?? 0,
      teamLabel,
      autoAssigned: false,
    });
    return dto;
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      throw new Sweet16Error(
        "TEAM_ALREADY_TAKEN",
        "That team was just taken — refresh and pick another.",
        409,
      );
    }
    throw e;
  }
}

/**
 * Timeout auto-assign: called opportunistically on GET/pick and swept every minute by cron.
 * Re-checks the current turn's purchase is still paid (payment reversal mid-draft skips the
 * turn without assigning) before randomly assigning a remaining team, retrying on collision.
 */
export async function autoAssignSweet16Turn(itemId: string): Promise<void> {
  const draft = await prisma.liveSweet16Draft.findUnique({ where: { liveRoomItemId: itemId } });
  if (!draft || draft.status !== "in_progress") return;
  if (!draft.currentTurnDeadlineAt || draft.currentTurnDeadlineAt.getTime() > Date.now()) return;
  if (!draft.currentTurnPurchaseId || draft.currentTurnIndex == null) return;

  const purchase = await prisma.liveItemVariantPurchase.findUnique({
    where: { id: draft.currentTurnPurchaseId },
    select: { paymentStatus: true },
  });
  if (!purchase || purchase.paymentStatus !== "paid") {
    // Forfeit: advance the turn without assigning a team. Next cron tick (or opportunistic
    // check) picks up any further overdue turn this creates.
    const turnOrder = asStringArray(draft.turnOrder);
    const nextIndex = draft.currentTurnIndex + 1;
    if (nextIndex < turnOrder.length) {
      await prisma.liveSweet16Draft.update({
        where: { liveRoomItemId: itemId },
        data: {
          currentTurnIndex: nextIndex,
          currentTurnPurchaseId: turnOrder[nextIndex]!,
          currentTurnDeadlineAt: new Date(Date.now() + draft.turnSeconds * 1000),
        },
      });
    } else {
      await prisma.liveSweet16Draft.update({
        where: { liveRoomItemId: itemId },
        data: {
          status: "complete",
          currentTurnIndex: null,
          currentTurnPurchaseId: null,
          currentTurnDeadlineAt: null,
          completedAt: new Date(),
        },
      });
    }
    return;
  }

  for (let attempt = 0; attempt < MAX_AUTO_ASSIGN_ATTEMPTS; attempt++) {
    const fresh = await prisma.liveSweet16Draft.findUnique({ where: { liveRoomItemId: itemId } });
    if (!fresh || fresh.status !== "in_progress" || fresh.currentTurnPurchaseId !== draft.currentTurnPurchaseId) {
      // Someone else (a manual pick, or a concurrent sweep) already resolved this turn.
      return;
    }
    const remaining = asStringArray(fresh.remainingTeamLabels);
    if (remaining.length === 0) return;
    const seed = randomBytes(4).readUInt32BE(0);
    const teamLabel = remaining[seed % remaining.length]!;
    try {
      await applyDraftPick({
        itemId,
        liveRoomId: draft.liveRoomId,
        purchaseId: fresh.currentTurnPurchaseId,
        turnIndex: fresh.currentTurnIndex ?? draft.currentTurnIndex,
        teamLabel,
        autoAssigned: true,
      });
      return;
    } catch (e) {
      if (isUniqueConstraintError(e)) continue;
      throw e;
    }
  }
}

/** Cron sweep across every in-progress draft with an overdue turn — mirrors the auction sweep. */
export async function finalizeOverdueSweet16DraftTurns(): Promise<{ checked: number; resolved: number }> {
  const overdue = await prisma.liveSweet16Draft.findMany({
    where: { status: "in_progress", currentTurnDeadlineAt: { not: null, lte: new Date() } },
    select: { liveRoomItemId: true },
    take: 50,
  });
  let resolved = 0;
  for (const row of overdue) {
    try {
      await autoAssignSweet16Turn(row.liveRoomItemId);
      resolved += 1;
    } catch (e) {
      console.error("[sweet16 draft] auto-assign sweep failed", {
        itemId: row.liveRoomItemId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { checked: overdue.length, resolved };
}
