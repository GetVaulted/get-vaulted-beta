import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/admin/admin-audit";

/**
 * Admin "move items between shows" tool (replaces the hand-run SQL used for DalyDouble / DTDT).
 *
 * Moving = re-parenting: the lots and every sold spot/bid on them are pointed at the new show, and
 * the new show is linked as a continuation of the old one so each buyer's live shipping cap carries
 * forward (see `resolveLiveShowContinuationChainIds`). Orders that already exist stay where they are.
 */

export type MovePlanRoom = {
  id: string;
  title: string;
  status: string;
  sellerId: string;
  sellerUsername: string;
  scheduledStartAt: string | null;
  continuationOfLiveRoomId: string | null;
  shippingMode: string;
  shippingCapEnabled: boolean;
  shippingCapCents: number | null;
  freeShippingEnabled: boolean;
  sellerPaysOverCap: boolean;
};

export type MovePlanItem = {
  id: string;
  title: string;
  status: string;
  sortOrder: number;
  paidSpots: number;
  pendingSpots: number;
  bids: number;
  moving: boolean;
};

export type MovePlanBuyer = {
  buyerId: string;
  username: string;
  spots: number;
  paidUsd: number;
  shippingInOldShow: { orders: number; chargedCents: number; capReached: boolean } | null;
  hasSessionInNewShow: boolean;
};

export type MovePlan = {
  from: MovePlanRoom;
  to: MovePlanRoom;
  items: MovePlanItem[];
  buyers: MovePlanBuyer[];
  totals: { items: number; paidSpots: number; pendingSpots: number; bids: number; buyers: number };
  willLinkContinuation: boolean;
  /** Stops the move. */
  blockers: string[];
  /** Worth reading, does not stop the move. */
  warnings: string[];
};

type Db = typeof prisma;

const roomSelect = {
  id: true,
  title: true,
  status: true,
  sellerId: true,
  seller: { select: { username: true } },
  scheduledStartAt: true,
  continuationOfLiveRoomId: true,
  shippingMode: true,
  shippingCapEnabled: true,
  shippingCapCents: true,
  freeShippingEnabled: true,
  sellerPaysOverCap: true,
} as const;

function toPlanRoom(r: {
  id: string;
  title: string;
  status: string;
  sellerId: string;
  seller: { username: string };
  scheduledStartAt: Date | null;
  continuationOfLiveRoomId: string | null;
  shippingMode: string;
  shippingCapEnabled: boolean;
  shippingCapCents: number | null;
  freeShippingEnabled: boolean;
  sellerPaysOverCap: boolean;
}): MovePlanRoom {
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    sellerId: r.sellerId,
    sellerUsername: r.seller.username,
    scheduledStartAt: r.scheduledStartAt?.toISOString() ?? null,
    continuationOfLiveRoomId: r.continuationOfLiveRoomId,
    shippingMode: String(r.shippingMode),
    shippingCapEnabled: r.shippingCapEnabled,
    shippingCapCents: r.shippingCapCents,
    freeShippingEnabled: r.freeShippingEnabled,
    sellerPaysOverCap: r.sellerPaysOverCap,
  };
}

/** True if `candidateId` appears in the continuation chain that starts at `startId` (walks "continuationOf" links). */
async function chainContains(db: Db, startId: string, candidateId: string): Promise<boolean> {
  const seen = new Set<string>();
  let cur: string | null = startId;
  while (cur && !seen.has(cur) && seen.size < 50) {
    if (cur === candidateId) return true;
    seen.add(cur);
    const row: { continuationOfLiveRoomId: string | null } | null = await db.liveRoom.findUnique({
      where: { id: cur },
      select: { continuationOfLiveRoomId: true },
    });
    cur = row?.continuationOfLiveRoomId ?? null;
  }
  return false;
}

/** Dry run: what a move would do and why it might not be allowed. Never writes. */
export async function planShowMove(
  args: { fromRoomId: string; toRoomId: string; itemIds?: string[] | null; linkContinuation?: boolean },
  db: Db = prisma,
): Promise<MovePlan | { error: "FROM_NOT_FOUND" | "TO_NOT_FOUND" }> {
  const [fromRow, toRow] = await Promise.all([
    db.liveRoom.findUnique({ where: { id: args.fromRoomId }, select: roomSelect }),
    db.liveRoom.findUnique({ where: { id: args.toRoomId }, select: roomSelect }),
  ]);
  if (!fromRow) return { error: "FROM_NOT_FOUND" };
  if (!toRow) return { error: "TO_NOT_FOUND" };
  const from = toPlanRoom(fromRow);
  const to = toPlanRoom(toRow);

  const blockers: string[] = [];
  const warnings: string[] = [];

  if (from.id === to.id) blockers.push("The old show and the new show are the same show.");
  if (from.sellerId !== to.sellerId) {
    blockers.push(`These shows belong to different sellers (@${from.sellerUsername} and @${to.sellerUsername}).`);
  }
  if (from.status === "live") blockers.push("The old show is live right now. End it first, then move items.");
  if (to.status === "ended") blockers.push("The new show has already ended. Pick a scheduled or live show.");

  const itemRows = await db.liveRoomItem.findMany({
    where: { liveRoomId: from.id },
    orderBy: { sortOrder: "asc" },
    select: { id: true, title: true, status: true, sortOrder: true },
  });
  const wanted = args.itemIds && args.itemIds.length > 0 ? new Set(args.itemIds) : null;
  const unknown = wanted ? [...wanted].filter((id) => !itemRows.some((i) => i.id === id)) : [];
  if (unknown.length > 0) blockers.push(`${unknown.length} selected item(s) are not in the old show.`);
  const movingIds = itemRows.filter((i) => !wanted || wanted.has(i.id)).map((i) => i.id);
  if (movingIds.length === 0) blockers.push("There are no items to move.");

  const [purchases, bidGroups] = await Promise.all([
    db.liveItemVariantPurchase.findMany({
      where: { liveRoomId: from.id, liveRoomItemId: { in: movingIds } },
      select: { liveRoomItemId: true, buyerId: true, paymentStatus: true, totalUsd: true, buyer: { select: { username: true } } },
    }),
    db.liveRoomBid.groupBy({
      by: ["liveRoomItemId"],
      where: { liveRoomId: from.id, liveRoomItemId: { in: movingIds } },
      _count: true,
    }),
  ]);
  const bidsByItem = new Map(bidGroups.map((g) => [g.liveRoomItemId, g._count]));

  const items: MovePlanItem[] = itemRows.map((i) => {
    const mine = purchases.filter((p) => p.liveRoomItemId === i.id);
    return {
      id: i.id,
      title: i.title,
      status: String(i.status),
      sortOrder: i.sortOrder,
      paidSpots: mine.filter((p) => p.paymentStatus === "paid").length,
      pendingSpots: mine.filter((p) => p.paymentStatus === "pending_payment").length,
      bids: bidsByItem.get(i.id) ?? 0,
      moving: movingIds.includes(i.id),
    };
  });

  // Buyers and their shipping position.
  const buyerMap = new Map<string, MovePlanBuyer>();
  for (const p of purchases) {
    if (p.paymentStatus === "cancelled" || p.paymentStatus === "failed") continue;
    const b =
      buyerMap.get(p.buyerId) ??
      ({
        buyerId: p.buyerId,
        username: p.buyer.username,
        spots: 0,
        paidUsd: 0,
        shippingInOldShow: null,
        hasSessionInNewShow: false,
      } satisfies MovePlanBuyer);
    b.spots += 1;
    if (p.paymentStatus === "paid") b.paidUsd += p.totalUsd;
    buyerMap.set(p.buyerId, b);
  }
  const buyerIds = [...buyerMap.keys()];
  if (buyerIds.length > 0) {
    const [oldSessions, newSessions] = await Promise.all([
      db.liveShippingSession.findMany({
        where: { liveShowId: from.id, sellerId: from.sellerId, buyerId: { in: buyerIds } },
        select: { buyerId: true, shippingChargedCents: true, capReached: true, _count: { select: { orders: true } } },
      }),
      db.liveShippingSession.findMany({
        where: { liveShowId: to.id, sellerId: to.sellerId, buyerId: { in: buyerIds } },
        select: { buyerId: true },
      }),
    ]);
    for (const s of oldSessions) {
      const b = buyerMap.get(s.buyerId);
      if (!b) continue;
      const prev = b.shippingInOldShow ?? { orders: 0, chargedCents: 0, capReached: false };
      b.shippingInOldShow = {
        orders: prev.orders + s._count.orders,
        chargedCents: prev.chargedCents + s.shippingChargedCents,
        capReached: prev.capReached || s.capReached,
      };
    }
    for (const s of newSessions) {
      const b = buyerMap.get(s.buyerId);
      if (b) b.hasSessionInNewShow = true;
    }
  }
  const buyers = [...buyerMap.values()].sort((a, b) => b.spots - a.spots);

  const paidSpots = items.filter((i) => i.moving).reduce((n, i) => n + i.paidSpots, 0);
  const pendingSpots = items.filter((i) => i.moving).reduce((n, i) => n + i.pendingSpots, 0);
  const bids = items.filter((i) => i.moving).reduce((n, i) => n + i.bids, 0);

  // Continuation link.
  let willLinkContinuation = false;
  if (args.linkContinuation !== false && from.id !== to.id) {
    if (to.continuationOfLiveRoomId && to.continuationOfLiveRoomId !== from.id) {
      warnings.push("The new show is already linked as a continuation of a different show. That link will be left as is.");
    } else if (to.continuationOfLiveRoomId === from.id) {
      warnings.push("The new show is already linked to the old show for shipping.");
    } else if (await chainContains(db, from.id, to.id)) {
      blockers.push("Linking would create a loop: the old show already continues from the new show.");
    } else {
      willLinkContinuation = true;
    }
  }

  if (pendingSpots > 0) warnings.push(`${pendingSpots} spot(s) are waiting on payment. They move too and can still complete.`);
  if (bids > 0) warnings.push(`${bids} auction bid(s) on the moving items will move with them.`);
  if (items.some((i) => i.moving && i.status === "active")) {
    warnings.push("At least one moving item is the active item. Check the old show before moving it.");
  }
  if (buyers.some((b) => b.shippingInOldShow && b.shippingInOldShow.orders > 0) && !willLinkContinuation && to.continuationOfLiveRoomId !== from.id) {
    warnings.push("Buyers have shipping already charged in the old show, but the shows are not being linked. Their shipping cap will NOT carry forward.");
  }
  const diffs: string[] = [];
  if (from.shippingMode !== to.shippingMode) diffs.push(`shipping mode (${from.shippingMode} vs ${to.shippingMode})`);
  if (from.shippingCapEnabled !== to.shippingCapEnabled) diffs.push("shipping cap on/off");
  if ((from.shippingCapCents ?? null) !== (to.shippingCapCents ?? null)) {
    diffs.push(`cap amount (${from.shippingCapCents ?? "none"} vs ${to.shippingCapCents ?? "none"} cents)`);
  }
  if (from.freeShippingEnabled !== to.freeShippingEnabled) diffs.push("free shipping on/off");
  if (from.sellerPaysOverCap !== to.sellerPaysOverCap) diffs.push("who pays above the cap");
  if (diffs.length > 0) {
    warnings.push(`The two shows have different shipping settings: ${diffs.join(", ")}. Buyers will be charged under the NEW show's settings.`);
  }
  const teamBoard = await db.liveRoomTeamBoard.findUnique({ where: { liveRoomId: from.id }, select: { liveRoomId: true } });
  if (teamBoard) {
    warnings.push("The old show has a team board. The board itself stays with the old show; only the sold spots and lots move.");
  }
  const legacySpots = await db.breakSpot.count({ where: { liveRoomId: from.id } });
  if (legacySpots > 0) warnings.push(`${legacySpots} legacy break spot row(s) stay with the old show.`);

  return {
    from,
    to,
    items,
    buyers,
    totals: { items: movingIds.length, paidSpots, pendingSpots, bids, buyers: buyers.length },
    willLinkContinuation,
    blockers,
    warnings,
  };
}

export type MoveExpectation = { items: number; paidSpots: number; pendingSpots: number; buyers: number };

export class ShowMoveError extends Error {
  constructor(
    public code: string,
    public status: number,
    public detail?: unknown,
  ) {
    super(code);
    this.name = "ShowMoveError";
  }
}

/**
 * Do the move in one transaction. `expect` is the totals the admin saw in the preview: if the live
 * data has changed since (a sale landed, someone edited), the move is refused so nothing surprising happens.
 */
export async function executeShowMove(args: {
  adminUserId: string;
  fromRoomId: string;
  toRoomId: string;
  itemIds?: string[] | null;
  linkContinuation?: boolean;
  reason: string;
  expect: MoveExpectation;
}) {
  return prisma.$transaction(
    async (tx) => {
      const txDb = tx as unknown as Db;
      const plan = await planShowMove(
        { fromRoomId: args.fromRoomId, toRoomId: args.toRoomId, itemIds: args.itemIds, linkContinuation: args.linkContinuation },
        txDb,
      );
      if ("error" in plan) throw new ShowMoveError(plan.error, 404);
      if (plan.blockers.length > 0) throw new ShowMoveError("BLOCKED", 400, plan.blockers);

      const t = plan.totals;
      if (
        t.items !== args.expect.items ||
        t.paidSpots !== args.expect.paidSpots ||
        t.pendingSpots !== args.expect.pendingSpots ||
        t.buyers !== args.expect.buyers
      ) {
        throw new ShowMoveError("PLAN_CHANGED", 409, plan.totals);
      }

      const movingItems = plan.items.filter((i) => i.moving);
      const ids = movingItems.map((i) => i.id);

      const maxSort = await tx.liveRoomItem.aggregate({ where: { liveRoomId: plan.to.id }, _max: { sortOrder: true } });
      let nextSort = (maxSort._max.sortOrder ?? -1) + 1;
      for (const item of movingItems) {
        await tx.liveRoomItem.update({
          where: { id: item.id },
          data: { liveRoomId: plan.to.id, sortOrder: nextSort++, itemVersion: { increment: 1 } },
        });
      }

      const purchases = await tx.liveItemVariantPurchase.updateMany({
        where: { liveRoomItemId: { in: ids }, liveRoomId: plan.from.id },
        data: { liveRoomId: plan.to.id },
      });
      await tx.liveRoomBid.updateMany({ where: { liveRoomItemId: { in: ids } }, data: { liveRoomId: plan.to.id } });
      await tx.liveAuctionProxyBid.updateMany({ where: { liveRoomItemId: { in: ids } }, data: { liveRoomId: plan.to.id } });
      await tx.liveSweet16Draft.updateMany({ where: { liveRoomItemId: { in: ids } }, data: { liveRoomId: plan.to.id } });
      await tx.liveSweet16DraftPick.updateMany({ where: { draftId: { in: ids } }, data: { liveRoomId: plan.to.id } });
      await tx.liveBidIdempotency.updateMany({
        where: { itemId: { in: ids }, liveRoomId: plan.from.id },
        data: { liveRoomId: plan.to.id },
      });

      if (plan.willLinkContinuation) {
        await tx.liveRoom.update({ where: { id: plan.to.id }, data: { continuationOfLiveRoomId: plan.from.id } });
      }
      // Clients refetch on a version bump.
      await tx.liveRoom.updateMany({ where: { id: { in: [plan.from.id, plan.to.id] } }, data: { roomVersion: { increment: 1 } } });

      await logAdminAction(
        {
          adminUserId: args.adminUserId,
          action: "show.move_items",
          targetType: "live_room",
          targetId: plan.to.id,
          targetUserId: plan.to.sellerId,
          reason: args.reason,
          detail: {
            fromRoomId: plan.from.id,
            toRoomId: plan.to.id,
            itemIds: ids,
            purchasesMoved: purchases.count,
            linkedContinuation: plan.willLinkContinuation,
            buyers: plan.buyers.map((b) => ({ id: b.buyerId, spots: b.spots })),
          },
        },
        tx as unknown as Pick<Db, "adminActionLog">,
      );

      return { moved: { items: ids.length, purchases: purchases.count }, linkedContinuation: plan.willLinkContinuation };
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

/** Link-only: make `toRoomId` a continuation of `fromRoomId` so shipping caps carry forward (no items move). */
export async function linkShowContinuation(args: { adminUserId: string; fromRoomId: string; toRoomId: string; reason: string }) {
  return prisma.$transaction(async (tx) => {
    const txDb = tx as unknown as Db;
    const [from, to] = await Promise.all([
      tx.liveRoom.findUnique({ where: { id: args.fromRoomId }, select: { id: true, sellerId: true } }),
      tx.liveRoom.findUnique({ where: { id: args.toRoomId }, select: { id: true, sellerId: true, continuationOfLiveRoomId: true } }),
    ]);
    if (!from || !to) throw new ShowMoveError("NOT_FOUND", 404);
    if (from.id === to.id) throw new ShowMoveError("SAME_SHOW", 400);
    if (from.sellerId !== to.sellerId) throw new ShowMoveError("DIFFERENT_SELLERS", 400);
    if (to.continuationOfLiveRoomId === from.id) throw new ShowMoveError("ALREADY_LINKED", 409);
    if (to.continuationOfLiveRoomId) throw new ShowMoveError("TARGET_ALREADY_LINKED_ELSEWHERE", 409);
    if (await chainContains(txDb, from.id, to.id)) throw new ShowMoveError("WOULD_LOOP", 400);

    await tx.liveRoom.update({ where: { id: to.id }, data: { continuationOfLiveRoomId: from.id } });
    await logAdminAction(
      {
        adminUserId: args.adminUserId,
        action: "show.link_continuation",
        targetType: "live_room",
        targetId: to.id,
        targetUserId: to.sellerId,
        reason: args.reason,
        detail: { fromRoomId: from.id, toRoomId: to.id },
      },
      tx as unknown as Pick<Db, "adminActionLog">,
    );
    return { linked: true };
  });
}
