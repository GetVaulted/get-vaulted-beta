import { randomBytes } from "crypto";
import { Prisma } from "@/generated/prisma/client";
import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import { prisma } from "@/lib/prisma";
import { NFL_TEAMS_PRESET } from "@/lib/live-item-variant-presets";
import {
  SWEET16_MAX_SPOTS,
  SWEET16_PENDING_PAYMENT_MAX_AGE_MS,
  buildSweet16Board,
  combineSweet16SpotAbbr,
  combineSweet16SpotLabel,
  countBlockingPendingPayments,
  isLegacySweet16SlotBoard,
  resolveViewerPurchaseId,
  sweet16DraftPoolLabels,
  sweet16HasRoomFor,
  type Sweet16BoardTile,
} from "@/lib/live-sweet16-draft-logic";
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
  /**
   * `not_started`: no order yet. `order_set`: the host randomized the draft order (everyone can
   * see it) but has not started the first pick. `in_progress`: a buyer is on the clock.
   */
  status: "not_started" | "order_set" | "in_progress" | "complete";
  turnOrder: string[];
  /** Same order as `turnOrder`, with who each turn belongs to and the team they bought. */
  order: Array<{
    purchaseId: string;
    turnIndex: number;
    buyerUsername: string | null;
    boughtTeamLabel: string | null;
    boughtTeamAbbr: string | null;
  }>;
  /** Every team on the board and where it stands: open, bought at checkout, or drafted. */
  board: Sweet16BoardTile[];
  /** Sales stop at this many sold teams. */
  maxSpots: number;
  soldCount: number;
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

type Db = typeof prisma | TransactionClient;

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
  db: Db = prisma,
  viewerUserId?: string | null,
): Promise<Sweet16DraftDto> {
  const turnOrder = asStringArray(draft.turnOrder);
  const [pickRows, variants, purchases] = await Promise.all([
    db.liveSweet16DraftPick.findMany({
      where: { draftId: draft.liveRoomItemId },
      orderBy: { turnIndex: "asc" },
    }),
    db.liveItemVariant.findMany({
      where: { liveRoomItemId: draft.liveRoomItemId, status: { not: "removed" } },
      select: { label: true, sortOrder: true },
    }),
    // Paid purchases are the board; anything in the turn order is included even if it was later
    // reversed so the order list never loses a row.
    db.liveItemVariantPurchase.findMany({
      where: {
        liveRoomItemId: draft.liveRoomItemId,
        OR: [{ paymentStatus: "paid" }, ...(turnOrder.length ? [{ id: { in: turnOrder } }] : [])],
      },
      select: {
        id: true,
        buyerId: true,
        paymentStatus: true,
        variant: { select: { label: true } },
        buyer: { select: { username: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const purchaseById = new Map(purchases.map((p) => [p.id, p]));
  const paidPurchases = purchases.filter((p) => p.paymentStatus === "paid");
  const labelsAreSlots = isLegacySweet16SlotBoard(variants.map((v) => v.label));

  const picks = pickRows.map((p) => ({
    purchaseId: p.purchaseId,
    turnIndex: p.turnIndex,
    teamLabel: p.teamLabel,
    teamAbbr: p.teamAbbr,
    autoAssigned: p.autoAssigned,
    buyerUsername: purchaseById.get(p.purchaseId)?.buyer?.username ?? null,
  }));

  const order = turnOrder.map((purchaseId, turnIndex) => {
    const row = purchaseById.get(purchaseId);
    const boughtTeamLabel = labelsAreSlots ? null : (row?.variant.label ?? null);
    return {
      purchaseId,
      turnIndex,
      buyerUsername: row?.buyer?.username ?? null,
      boughtTeamLabel,
      boughtTeamAbbr: boughtTeamLabel ? abbrForTeamLabel(boughtTeamLabel) : null,
    };
  });

  // Legacy "Slot N" boards have no team tiles of their own, so show the NFL pool instead.
  const boardVariants = labelsAreSlots
    ? NFL_SWEET16_TEAM_POOL.map((t, i) => ({ label: t.label, abbr: t.abbr, sortOrder: i }))
    : variants.map((v) => ({ label: v.label, abbr: abbrForTeamLabel(v.label), sortOrder: v.sortOrder }));
  const board = buildSweet16Board(
    boardVariants,
    labelsAreSlots
      ? []
      : paidPurchases.map((p) => ({
          purchaseId: p.id,
          variantLabel: p.variant.label,
          buyerUsername: p.buyer?.username ?? null,
        })),
    picks.map((p) => ({ teamLabel: p.teamLabel, purchaseId: p.purchaseId, buyerUsername: p.buyerUsername })),
  );

  let viewerPurchaseId: string | null = null;
  if (viewerUserId) {
    // A buyer can own several spots, each with its own turn -- resolve against the current turn
    // instead of taking an arbitrary one (see resolveViewerPurchaseId).
    const mine = paidPurchases.filter((p) => p.buyerId === viewerUserId).map((p) => p.id).sort();
    viewerPurchaseId = resolveViewerPurchaseId(mine, draft.currentTurnPurchaseId);
  }

  const status: Sweet16DraftDto["status"] =
    draft.status === "not_started" && turnOrder.length > 0
      ? "order_set"
      : (draft.status as Sweet16DraftDto["status"]);

  return {
    itemId: draft.liveRoomItemId,
    liveRoomId: draft.liveRoomId,
    status,
    turnOrder,
    order,
    board,
    maxSpots: SWEET16_MAX_SPOTS,
    soldCount: paidPurchases.length,
    currentTurnIndex: draft.currentTurnIndex,
    currentTurnPurchaseId: draft.currentTurnPurchaseId,
    currentTurnBuyerUsername: draft.currentTurnPurchaseId
      ? (purchaseById.get(draft.currentTurnPurchaseId)?.buyer?.username ?? null)
      : null,
    currentTurnDeadlineAt: draft.currentTurnDeadlineAt?.toISOString() ?? null,
    remainingTeamLabels: asStringArray(draft.remainingTeamLabels),
    turnSeconds: draft.turnSeconds,
    startedAt: draft.startedAt?.toISOString() ?? null,
    completedAt: draft.completedAt?.toISOString() ?? null,
    viewerPurchaseId,
    picks,
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
 * Called inside the purchase transaction for every Sweet 16 checkout. The board lists 32 teams
 * but only 16 may be sold: lock the item row so two simultaneous checkouts are serialized, then
 * count paid + in-flight purchases. Throws SOLD_OUT once the cap is reached; a failed or
 * abandoned checkout stops counting, which frees the spot again.
 */
export async function assertSweet16CapacityInTx(
  tx: TransactionClient,
  args: { itemId: string; variantAssignmentMode: string | null | undefined; additional: number },
): Promise<void> {
  if (args.variantAssignmentMode !== "draft") return;
  await tx.$queryRaw`SELECT id FROM "LiveRoomItem" WHERE id = ${args.itemId} FOR UPDATE`;
  const variants = await tx.liveItemVariant.findMany({
    where: { liveRoomItemId: args.itemId, status: { not: "removed" } },
    select: { label: true },
  });
  // Legacy 16-slot boards are capped by their own 16 rows already.
  if (isLegacySweet16SlotBoard(variants.map((v) => v.label))) return;
  const cutoff = new Date(Date.now() - SWEET16_PENDING_PAYMENT_MAX_AGE_MS);
  const rows = await tx.liveItemVariantPurchase.findMany({
    where: {
      liveRoomItemId: args.itemId,
      OR: [{ paymentStatus: "paid" }, { paymentStatus: "pending_payment", createdAt: { gt: cutoff } }],
    },
    select: { quantity: true },
  });
  const reserved = rows.reduce((sum, r) => sum + r.quantity, 0);
  if (!sweet16HasRoomFor(reserved, args.additional)) {
    throw Object.assign(new Error("SWEET16_SOLD_OUT"), { code: "SWEET16_SOLD_OUT" });
  }
}

/** True once enough teams are paid for that sales should stop (drives `variantBreakReadyAt`). */
export async function sweet16SalesAreFull(itemId: string): Promise<boolean> {
  const variants = await prisma.liveItemVariant.findMany({
    where: { liveRoomItemId: itemId, status: { not: "removed" } },
    select: { label: true },
  });
  if (isLegacySweet16SlotBoard(variants.map((v) => v.label))) return false;
  const paid = await prisma.liveItemVariantPurchase.aggregate({
    where: { liveRoomItemId: itemId, paymentStatus: "paid" },
    _sum: { quantity: true },
  });
  return (paid._sum.quantity ?? 0) >= SWEET16_MAX_SPOTS;
}

type DraftItemRow = {
  id: string;
  variantAssignmentMode: string;
  variantBreakReadyAt: Date | null;
  variants: { id: string; label: string; sortOrder: number }[];
};

async function loadDraftableItem(liveRoomId: string, itemId: string): Promise<DraftItemRow> {
  const item = await prisma.liveRoomItem.findFirst({
    where: { id: itemId, liveRoomId },
    select: {
      id: true,
      variantAssignmentMode: true,
      variantBreakReadyAt: true,
      variants: { where: { status: { not: "removed" } }, select: { id: true, label: true, sortOrder: true } },
    },
  });
  if (!item) throw new Sweet16Error("ITEM_NOT_FOUND", "Item not found.", 404);
  if (item.variantAssignmentMode !== "draft") {
    throw new Sweet16Error("NOT_A_SWEET16_ITEM", "This lot is not a Sweet 16 break.", 400);
  }
  if (!item.variantBreakReadyAt) {
    throw new Sweet16Error(
      "NOT_READY",
      `Sales are still open — ${SWEET16_MAX_SPOTS} teams must be sold before the draft.`,
      409,
    );
  }
  return item;
}

/** Only paid purchases hold a turn; a checkout still in flight would be left out of the draft. */
async function assertNoBlockingPayments(variantIds: string[]): Promise<void> {
  const pendingRows = await prisma.liveItemVariantPurchase.findMany({
    where: { variantId: { in: variantIds }, paymentStatus: "pending_payment" },
    select: { paymentStatus: true, createdAt: true },
  });
  const pendingCount = countBlockingPendingPayments(
    pendingRows.map((r) => ({ paymentStatus: r.paymentStatus, createdAtMs: r.createdAt.getTime() })),
    Date.now(),
  );
  if (pendingCount > 0) {
    throw new Sweet16Error(
      "PAYMENTS_PENDING",
      pendingCount === 1
        ? "One buyer is still completing payment. Try again in a moment."
        : `${pendingCount} buyers are still completing payment. Try again in a moment.`,
      409,
    );
  }
}

/**
 * Step 1 — host taps "Randomize order" once sales have stopped. Crypto-shuffles the paid
 * purchases into a turn order and builds the draft pool (every team nobody bought). Nothing is
 * on the clock yet: everyone can see the order, and the host starts the picks separately.
 * The order is locked once set so it can't be re-rolled until a result looks "better".
 */
export async function randomizeSweet16DraftOrder(args: {
  liveRoomId: string;
  itemId: string;
}): Promise<Sweet16DraftDto> {
  const { liveRoomId, itemId } = args;
  const item = await loadDraftableItem(liveRoomId, itemId);

  const existing = await prisma.liveSweet16Draft.findUnique({ where: { liveRoomItemId: itemId } });
  if (existing && (existing.status !== "not_started" || asStringArray(existing.turnOrder).length > 0)) {
    throw new Sweet16Error(
      existing.status === "not_started" ? "ORDER_ALREADY_SET" : "ALREADY_STARTED",
      existing.status === "not_started"
        ? "The draft order is already set."
        : "This draft has already started.",
      409,
    );
  }

  await assertNoBlockingPayments(item.variants.map((v) => v.id));

  const paidPurchases = await prisma.liveItemVariantPurchase.findMany({
    where: { liveRoomItemId: itemId, paymentStatus: "paid" },
    select: { id: true, variant: { select: { label: true } } },
  });
  if (paidPurchases.length === 0) {
    throw new Sweet16Error("NO_PAID_SLOTS", "No paid teams found for this break.", 409);
  }

  const legacy = isLegacySweet16SlotBoard(item.variants.map((v) => v.label));
  const remainingTeamLabels = legacy
    ? NFL_SWEET16_TEAM_POOL.map((t) => t.label)
    : sweet16DraftPoolLabels(
        item.variants.map((v) => ({ label: v.label, abbr: abbrForTeamLabel(v.label), sortOrder: v.sortOrder })),
        paidPurchases.map((p) => p.variant.label),
      );
  if (remainingTeamLabels.length < paidPurchases.length) {
    throw new Sweet16Error("POOL_TOO_SMALL", "Not enough open teams left to draft.", 409);
  }

  const turnOrder = shuffledCopy(paidPurchases.map((p) => p.id));
  const draft = await prisma.liveSweet16Draft.upsert({
    where: { liveRoomItemId: itemId },
    create: {
      liveRoomItemId: itemId,
      liveRoomId,
      status: "not_started",
      turnOrder,
      currentTurnIndex: null,
      currentTurnPurchaseId: null,
      currentTurnDeadlineAt: null,
      remainingTeamLabels,
      turnSeconds: SWEET16_DEFAULT_TURN_SECONDS,
    },
    update: {
      status: "not_started",
      turnOrder,
      currentTurnIndex: null,
      currentTurnPurchaseId: null,
      currentTurnDeadlineAt: null,
      remainingTeamLabels,
      startedAt: null,
      completedAt: null,
    },
  });

  const dto = await toDraftDto(draft);
  emitSweet16DraftStarted(liveRoomId, {
    itemId,
    phase: "order_set",
    turnOrder,
    currentTurnIndex: null,
    currentTurnPurchaseId: null,
    currentTurnDeadlineAt: null,
    remainingTeamLabels,
    turnSeconds: draft.turnSeconds,
  });
  return dto;
}

/**
 * Step 2 — host taps "Start draft" after the order is set. Opens the first buyer's turn; each
 * pick then moves the clock to the next buyer in order.
 */
export async function startSweet16Draft(args: { liveRoomId: string; itemId: string }): Promise<Sweet16DraftDto> {
  const { liveRoomId, itemId } = args;
  await loadDraftableItem(liveRoomId, itemId);

  const existing = await prisma.liveSweet16Draft.findUnique({ where: { liveRoomItemId: itemId } });
  const turnOrder = existing ? asStringArray(existing.turnOrder) : [];
  if (!existing || turnOrder.length === 0) {
    throw new Sweet16Error("ORDER_NOT_SET", "Randomize the draft order first.", 409);
  }
  if (existing.status !== "not_started") {
    throw new Sweet16Error("ALREADY_STARTED", "This draft has already started.", 409);
  }

  const now = new Date();
  const turnSeconds = existing.turnSeconds || SWEET16_DEFAULT_TURN_SECONDS;
  const deadline = new Date(now.getTime() + turnSeconds * 1000);
  const remainingTeamLabels = asStringArray(existing.remainingTeamLabels);

  // Guarded so a double-tap on "Start draft" only opens the first turn once.
  const claimed = await prisma.liveSweet16Draft.updateMany({
    where: { liveRoomItemId: itemId, status: "not_started" },
    data: {
      status: "in_progress",
      currentTurnIndex: 0,
      currentTurnPurchaseId: turnOrder[0]!,
      currentTurnDeadlineAt: deadline,
      startedAt: now,
      completedAt: null,
    },
  });
  if (claimed.count === 0) {
    throw new Sweet16Error("ALREADY_STARTED", "This draft has already started.", 409);
  }

  const draft = await prisma.liveSweet16Draft.findUniqueOrThrow({ where: { liveRoomItemId: itemId } });
  const dto = await toDraftDto(draft);
  emitSweet16DraftStarted(liveRoomId, {
    itemId,
    phase: "started",
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
    // The buyer already owns the team they bought; show both ("Bills + Chiefs") everywhere the
    // purchase's team is displayed (orders, recent sales, fulfillment).
    const owned = await tx.liveItemVariantPurchase.findUnique({
      where: { id: args.purchaseId },
      select: { variant: { select: { label: true } } },
    });
    const boughtLabel = owned?.variant.label ?? null;
    const legacySlot = boughtLabel ? isLegacySweet16SlotBoard([boughtLabel]) : true;
    await tx.liveItemVariantPurchase.update({
      where: { id: args.purchaseId },
      data: {
        revealedLabel: legacySlot ? args.teamLabel : combineSweet16SpotLabel(boughtLabel, args.teamLabel),
        revealedAbbr: legacySlot
          ? teamAbbr
          : combineSweet16SpotAbbr(boughtLabel ? abbrForTeamLabel(boughtLabel) : null, teamAbbr),
      },
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

  const ownedPurchases = await prisma.liveItemVariantPurchase.findMany({
    where: { liveRoomItemId: args.itemId, buyerId: args.buyerUserId, paymentStatus: "paid" },
    select: { id: true },
  });
  if (ownedPurchases.length === 0) {
    throw new Sweet16Error("NOT_A_PARTICIPANT", "You don't have a paid team in this break.", 403);
  }
  // A buyer can own several slots; the pick counts for whichever of theirs is up now.
  const purchase = ownedPurchases.find((p) => p.id === draft.currentTurnPurchaseId);
  if (!purchase) {
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
