/**
 * Sweet 16 Break end to end, against a real Postgres: 32 teams on the board, a hard cap of 16
 * sales under concurrent checkouts, then randomize order -> start draft -> pick-by-pick to the end.
 *
 * Needs a disposable database with migrations already applied:
 *   INTEGRATION_DATABASE_URL=postgresql://... npx vitest run --config vitest.integration.config.ts \
 *     src/lib/live-sweet16-draft.integration.test.ts
 * It only creates and removes rows of its own (unique ids), so it never resets the database.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/realtime-emit-server", () => ({
  emitSweet16DraftStarted: vi.fn(),
  emitSweet16DraftPickMade: vi.fn(),
  emitSweet16DraftComplete: vi.fn(),
  emitLiveRoomMessageById: vi.fn(),
  emitLiveRoomMessagesRefetch: vi.fn(),
  emitLiveRoomQueueItemsChanged: vi.fn(),
  emitTeamBreakBegan: vi.fn(),
  emitTeamBreakReady: vi.fn(),
}));

import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { NFL_TEAMS_PRESET } from "@/lib/live-item-variant-presets";
import { maybeMarkVariantBreakReady } from "@/lib/live-item-variant-break";
import {
  assertSweet16CapacityInTx,
  getSweet16DraftDto,
  makeSweet16DraftPick,
  randomizeSweet16DraftOrder,
  startSweet16Draft,
  sweet16SalesAreFull,
} from "@/lib/live-sweet16-draft";
import { connectMigratedIntegrationPrisma, seedUser, teardownIntegrationPrisma } from "@/test/integration-setup";

const RUN = `s16${Date.now().toString(36)}`;
const BUYERS = 20;

describe("Sweet 16 Break (integration)", () => {
  let db: PrismaClient;
  let sellerId: string;
  let roomId: string;
  let itemId: string;
  const userIds: string[] = [];
  let buyers: { id: string; username: string }[] = [];
  let variantByLabel = new Map<string, string>();

  beforeAll(async () => {
    db = await connectMigratedIntegrationPrisma();
    const seller = await seedUser(db, { email: `${RUN}_seller@test.internal`, username: `${RUN}seller` });
    sellerId = seller.id;
    userIds.push(seller.id);

    const room = await db.liveRoom.create({
      data: { sellerId, title: `${RUN} sweet16`, roomType: "sale", status: "live" },
    });
    roomId = room.id;
    const item = await db.liveRoomItem.create({
      data: {
        liveRoomId: roomId,
        title: "Sweet 16 Break",
        status: "active",
        salesFormat: "variant_selection",
        variantAssignmentMode: "draft",
      },
    });
    itemId = item.id;
    await db.liveItemVariant.createMany({
      data: NFL_TEAMS_PRESET.map((t, i) => ({
        liveRoomItemId: itemId,
        label: t.label,
        priceUsd: 10,
        quantityInitial: 1,
        quantityRemaining: 1,
        sortOrder: i,
        color: t.abbr ?? "",
      })),
    });
    const variants = await db.liveItemVariant.findMany({ where: { liveRoomItemId: itemId } });
    variantByLabel = new Map(variants.map((v) => [v.label, v.id]));

    await db.user.createMany({
      data: Array.from({ length: BUYERS }, (_, i) => ({
        email: `${RUN}_b${i}@test.internal`,
        username: `${RUN}b${i}`,
        emailVerified: new Date(),
      })),
    });
    buyers = await db.user.findMany({
      where: { username: { startsWith: `${RUN}b` } },
      select: { id: true, username: true },
      orderBy: { username: "asc" },
    });
    userIds.push(...buyers.map((b) => b.id));
  }, 180_000);

  afterAll(async () => {
    await db.liveRoom.deleteMany({ where: { id: roomId } }).catch(() => {});
    await db.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
    await teardownIntegrationPrisma();
  });

  /** Mirrors the purchase route's transaction: cap check, reserve the team, create the checkout. */
  const checkout = (buyerId: string, label: string) =>
    prisma.$transaction(async (tx) => {
      await assertSweet16CapacityInTx(tx, { itemId, variantAssignmentMode: "draft", additional: 1 });
      const variantId = variantByLabel.get(label)!;
      const taken = await tx.liveItemVariant.updateMany({
        where: { id: variantId, quantityRemaining: { gte: 1 } },
        data: { quantityRemaining: { decrement: 1 }, soldCount: { increment: 1 }, status: "sold_out" },
      });
      if (taken.count === 0) throw Object.assign(new Error("SOLD_OUT"), { code: "SOLD_OUT" });
      return tx.liveItemVariantPurchase.create({
        data: {
          liveRoomId: roomId,
          liveRoomItemId: itemId,
          variantId,
          buyerId,
          quantity: 1,
          unitPriceUsd: 10,
          totalUsd: 10,
          paymentStatus: "pending_payment",
        },
        select: { id: true },
      });
    });

  it("stops at exactly 16 sales when 20 buyers check out at the same moment", async () => {
    const labels = NFL_TEAMS_PRESET.map((t) => t.label);
    const results = await Promise.allSettled(buyers.map((b, i) => checkout(b.id, labels[i]!)));
    const ok = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(16);
    expect(rejected).toHaveLength(BUYERS - 16);
    for (const r of rejected) expect((r.reason as { code?: string }).code).toBe("SWEET16_SOLD_OUT");
  }, 120_000);

  it("keeps sales open until the 16 checkouts are actually paid, then closes them", async () => {
    expect(await sweet16SalesAreFull(itemId)).toBe(false);
    expect(await maybeMarkVariantBreakReady(itemId, roomId, sellerId)).toBe(false);

    // Draft can't start (or be randomized) while sales are still open.
    await expect(randomizeSweet16DraftOrder({ liveRoomId: roomId, itemId })).rejects.toMatchObject({
      code: "NOT_READY",
    });

    // Pay 15 of 16 — still open.
    const pending = await db.liveItemVariantPurchase.findMany({
      where: { liveRoomItemId: itemId },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    expect(pending).toHaveLength(16);
    await db.liveItemVariantPurchase.updateMany({
      where: { id: { in: pending.slice(0, 15).map((p) => p.id) } },
      data: { paymentStatus: "paid", paidAt: new Date() },
    });
    expect(await maybeMarkVariantBreakReady(itemId, roomId, sellerId)).toBe(false);

    await db.liveItemVariantPurchase.update({
      where: { id: pending[15]!.id },
      data: { paymentStatus: "paid", paidAt: new Date() },
    });
    expect(await maybeMarkVariantBreakReady(itemId, roomId, sellerId)).toBe(true);
    const item = await db.liveRoomItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(item.variantBreakReadyAt).not.toBeNull();
  });

  it("refuses to start before the order is randomized", async () => {
    await expect(startSweet16Draft({ liveRoomId: roomId, itemId })).rejects.toMatchObject({ code: "ORDER_NOT_SET" });
  });

  it("randomize sets a visible order from the 16 buyers and a pool of the 16 unsold teams", async () => {
    const dto = await randomizeSweet16DraftOrder({ liveRoomId: roomId, itemId });
    expect(dto.status).toBe("order_set");
    expect(dto.order).toHaveLength(16);
    expect(dto.currentTurnPurchaseId).toBeNull();
    expect(dto.remainingTeamLabels).toHaveLength(16);
    expect(new Set(dto.order.map((o) => o.purchaseId)).size).toBe(16);

    const boughtLabels = new Set(dto.order.map((o) => o.boughtTeamLabel));
    expect(boughtLabels.size).toBe(16);
    for (const label of dto.remainingTeamLabels) expect(boughtLabels.has(label)).toBe(false);

    expect(dto.board).toHaveLength(32);
    expect(dto.board.filter((t) => t.state === "purchased")).toHaveLength(16);
    expect(dto.board.filter((t) => t.state === "open")).toHaveLength(16);
    expect(dto.soldCount).toBe(16);
    expect(dto.maxSpots).toBe(16);
  });

  it("locks the order once set, and shows it to a viewer fetching state", async () => {
    await expect(randomizeSweet16DraftOrder({ liveRoomId: roomId, itemId })).rejects.toMatchObject({
      code: "ORDER_ALREADY_SET",
    });
    const dto = await getSweet16DraftDto(itemId, buyers[0]!.id);
    expect(dto?.status).toBe("order_set");
    expect(dto?.viewerPurchaseId).toBeTruthy();
  });

  it("starts the draft, opens the first buyer's turn, and a double tap does not restart it", async () => {
    const started = await startSweet16Draft({ liveRoomId: roomId, itemId });
    expect(started.status).toBe("in_progress");
    expect(started.currentTurnIndex).toBe(0);
    expect(started.currentTurnPurchaseId).toBe(started.turnOrder[0]);
    await expect(startSweet16Draft({ liveRoomId: roomId, itemId })).rejects.toMatchObject({ code: "ALREADY_STARTED" });
  });

  it("runs the draft in order: only the buyer on the clock can pick, from the unsold teams only", async () => {
    const first = (await getSweet16DraftDto(itemId))!;
    const pool = [...first.remainingTeamLabels];
    const purchaseOwner = new Map(
      (
        await db.liveItemVariantPurchase.findMany({
          where: { liveRoomItemId: itemId },
          select: { id: true, buyerId: true },
        })
      ).map((p) => [p.id, p.buyerId]),
    );

    // Someone who is not on the clock is rejected.
    const onClock = first.currentTurnPurchaseId!;
    const stranger = [...purchaseOwner.entries()].find(([pid]) => pid !== onClock)![1];
    await expect(
      makeSweet16DraftPick({ liveRoomId: roomId, itemId, buyerUserId: stranger, teamLabel: pool[0]! }),
    ).rejects.toMatchObject({ code: "NOT_YOUR_TURN" });

    // A team that was already bought at checkout is not draftable.
    const bought = first.order[0]!.boughtTeamLabel!;
    await expect(
      makeSweet16DraftPick({
        liveRoomId: roomId,
        itemId,
        buyerUserId: purchaseOwner.get(onClock)!,
        teamLabel: bought,
      }),
    ).rejects.toMatchObject({ code: "INVALID_TEAM" });

    let dto = first;
    for (let turn = 0; turn < 16; turn++) {
      expect(dto.status).toBe("in_progress");
      expect(dto.currentTurnPurchaseId).toBe(dto.turnOrder[turn]);
      const label = dto.remainingTeamLabels[0]!;
      dto = await makeSweet16DraftPick({
        liveRoomId: roomId,
        itemId,
        buyerUserId: purchaseOwner.get(dto.currentTurnPurchaseId!)!,
        teamLabel: label,
      });
    }
    expect(dto.status).toBe("complete");
    expect(dto.picks).toHaveLength(16);
    expect(dto.remainingTeamLabels).toHaveLength(0);
    expect(dto.board.every((t) => t.state !== "open")).toBe(true);
    expect(dto.board.filter((t) => t.state === "drafted")).toHaveLength(16);
    expect(new Set(dto.picks.map((p) => p.teamLabel)).size).toBe(16);
    // Picks follow the shuffled order.
    expect(dto.picks.map((p) => p.purchaseId)).toEqual(dto.turnOrder);
  });

  it("gives every buyer both teams on their purchase: the one they bought + the one they drafted", async () => {
    const purchases = await db.liveItemVariantPurchase.findMany({
      where: { liveRoomItemId: itemId },
      include: { variant: { select: { label: true } }, sweet16DraftPick: true },
    });
    expect(purchases).toHaveLength(16);
    for (const p of purchases) {
      expect(p.sweet16DraftPick).not.toBeNull();
      expect(p.revealedLabel).toBe(`${p.variant.label} + ${p.sweet16DraftPick!.teamLabel}`);
    }
    // Every one of the 32 teams ends up with exactly one owner.
    const owned = new Set<string>();
    for (const p of purchases) {
      owned.add(p.variant.label);
      owned.add(p.sweet16DraftPick!.teamLabel);
    }
    expect(owned.size).toBe(32);
  });
});
