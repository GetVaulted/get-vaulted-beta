import { randomInt } from "crypto";
import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import { prisma } from "@/lib/prisma";
import { reportUrgentPaymentAnomaly } from "@/lib/cron-anomaly-alert";
import {
  assignedLabelsForItem,
  buildRandomRevealSpinPayload,
  randomPoolFromCustomLabels,
  surpriseSetItemNames,
} from "@/lib/live-item-variant-random-reveal";
import {
  emitLiveRoomMessageById,
  emitLiveRoomQueueItemsChanged,
  emitVaultRevealSpinAndWait,
} from "@/lib/realtime-emit-server";
import { normalizeCustomRandomPoolLabels } from "../../../shared/live-player-spot-list";
import { SURPRISE_SET_MAX_UNITS } from "../../../shared/surprise-set";

type Db = typeof prisma | TransactionClient;

/**
 * Surprise Set auction: a normal multi-unit live auction (one unit per round, host starts each
 * round) whose winner receives a random unit from the set. The draw happens only once the round's
 * order is paid — see {@link revealSurpriseAuctionDrawForOrder}.
 */
export function isSurpriseAuctionItem(item: {
  salesFormat?: string | null;
  surpriseSetItems?: unknown;
}): boolean {
  return item.salesFormat === "auction" && surpriseSetItemNames(item.surpriseSetItems) !== null;
}

/** Called inside the auction-win transaction right after the round's order is created. */
export async function recordSurpriseAuctionDrawTx(
  tx: TransactionClient,
  args: { liveRoomItemId: string; orderId: string; buyerId: string },
): Promise<void> {
  const item = await tx.liveRoomItem.findUnique({
    where: { id: args.liveRoomItemId },
    select: { salesFormat: true, surpriseSetItems: true },
  });
  if (!item || !isSurpriseAuctionItem(item)) return;
  await tx.surpriseAuctionDraw.upsert({
    where: { orderId: args.orderId },
    create: { liveRoomItemId: args.liveRoomItemId, orderId: args.orderId, buyerId: args.buyerId },
    update: {},
  });
}

function isUniqueConstraintError(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}

const MAX_DRAW_ATTEMPTS = 8;

/**
 * Draw the buyer's random unit for a paid Surprise Set auction order and broadcast the reveal card.
 * No-op for any other order and idempotent (an already-revealed draw returns its label). Never
 * throws — the order is already paid; a failed draw alerts ops instead.
 */
export async function revealSurpriseAuctionDrawForOrder(
  orderId: string,
): Promise<{ label: string } | null> {
  try {
    const draw = await prisma.surpriseAuctionDraw.findUnique({
      where: { orderId },
      select: {
        id: true,
        liveRoomItemId: true,
        revealedLabel: true,
        buyer: { select: { username: true } },
      },
    });
    if (!draw) return null;
    if (draw.revealedLabel) return { label: draw.revealedLabel };

    const item = await prisma.liveRoomItem.findUnique({
      where: { id: draw.liveRoomItemId },
      select: {
        id: true,
        title: true,
        liveRoomId: true,
        customRandomPoolLabels: true,
        surpriseSetItems: true,
        liveRoom: { select: { sellerId: true } },
      },
    });
    if (!item) return null;
    const names = surpriseSetItemNames(item.surpriseSetItems);
    const labels = normalizeCustomRandomPoolLabels(item.customRandomPoolLabels, SURPRISE_SET_MAX_UNITS) ?? [];
    const pool = randomPoolFromCustomLabels(labels);

    for (let attempt = 0; attempt < MAX_DRAW_ATTEMPTS; attempt++) {
      const taken = await assignedLabelsForItem(prisma, item.id);
      const remaining = pool.filter((p) => !taken.has(p.label.trim().toLowerCase()));
      if (remaining.length === 0) break;
      const winnerIndex = randomInt(remaining.length);
      const winner = remaining[winnerIndex]!;
      try {
        const updated = await prisma.surpriseAuctionDraw.updateMany({
          where: { id: draw.id, revealedLabel: null },
          data: { revealedLabel: winner.label, revealedAt: new Date() },
        });
        if (updated.count === 0) {
          // A concurrent reveal for this same order already drew — return what it drew.
          const again = await prisma.surpriseAuctionDraw.findUnique({
            where: { id: draw.id },
            select: { revealedLabel: true },
          });
          return again?.revealedLabel ? { label: again.revealedLabel } : null;
        }
      } catch (e) {
        if (isUniqueConstraintError(e)) continue; // another order took this unit — draw again
        throw e;
      }

      const username = (draw.buyer?.username ?? "").replace(/^@+/, "").trim() || "Buyer";
      const spin = buildRandomRevealSpinPayload({
        purchaseId: `auction-${draw.id}`,
        itemTitle: item.title,
        remaining,
        winnerIndex,
        buyerUsername: username,
        surpriseSetItemNames: names,
      });
      try {
        await emitVaultRevealSpinAndWait(item.liveRoomId, spin);
      } catch (e) {
        console.error("[surprise auction] reveal broadcast failed", { orderId, error: e });
      }
      if (item.liveRoom?.sellerId) {
        const shown = spin.surpriseCard?.cardWinner ?? winner.label;
        const msg = await prisma.liveRoomMessage.create({
          data: {
            liveRoomId: item.liveRoomId,
            senderId: item.liveRoom.sellerId,
            body: `@${username} got ${shown}`,
            messageType: "system",
          },
        });
        await emitLiveRoomMessageById(msg.id).catch(() => {});
      }
      emitLiveRoomQueueItemsChanged(item.liveRoomId);
      return { label: winner.label };
    }

    reportUrgentPaymentAnomaly(
      "surprise-auction-reveal",
      `Paid Surprise Set auction order has no unit left to draw — refund manually. orderId=${orderId} liveRoomItemId=${item.id}`,
    );
    return null;
  } catch (e) {
    console.error("[surprise auction] reveal failed", { orderId, error: e });
    reportUrgentPaymentAnomaly(
      "surprise-auction-reveal",
      `Surprise Set auction reveal failed for paid order ${orderId}: ${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  }
}

/**
 * The round's order was cancelled before payment (host cancelled the retry, or the payment window
 * expired): free the undrawn unit so the host can auction it again.
 */
export async function releaseSurpriseAuctionDrawForCancelledOrder(db: Db, orderId: string): Promise<boolean> {
  const draw = await db.surpriseAuctionDraw.findUnique({
    where: { orderId },
    select: { id: true, liveRoomItemId: true, revealedLabel: true },
  });
  if (!draw || draw.revealedLabel) return false;
  const deleted = await db.surpriseAuctionDraw.deleteMany({ where: { id: draw.id, revealedLabel: null } });
  if (deleted.count === 0) return false;
  const item = await db.liveRoomItem.findUnique({
    where: { id: draw.liveRoomItemId },
    select: { status: true, quantity: true, liveRoomId: true },
  });
  if (!item) return true;
  await db.liveRoomItem.update({
    where: { id: draw.liveRoomItemId },
    data: {
      quantity: item.status === "sold" ? 1 : item.quantity + 1,
      // A sold-out set goes back to the queue (never straight to "active", which could leave two
      // lots live at once); the host can bring it back up to auction the returned unit.
      ...(item.status === "sold" ? { status: "queued" } : {}),
      itemVersion: { increment: 1 },
    },
  });
  emitLiveRoomQueueItemsChanged(item.liveRoomId);
  return true;
}
