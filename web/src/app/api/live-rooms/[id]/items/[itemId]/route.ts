import { NextResponse } from "next/server";
import { isLiveRoomBroadcastOnAir } from "@/lib/live-room-broadcast-on-air";
import { requireLiveRoomHostUser } from "@/lib/resolve-live-room-host-user";
import {
  finalizeBreakAuctionRoundIfEnded,
  sendBreakAuctionWinNotificationsDeferred,
  type BreakRoundFinalizeResult,
} from "@/lib/break-live-auction-round-finalize";
import type { LiveRoomItemStatus } from "@/generated/prisma/client";
import { getLiveRoomItemSnapshotDto } from "@/lib/live-room-item-snapshot-server";
import { prisma } from "@/lib/prisma";
import { isVariantSalesFormat } from "@/lib/live-item-variant-presets";
import { beginVariantTeamBreak } from "@/lib/live-item-variant-break";
import {
  defaultActiveSpotModeForPin,
  idleVariantSpotCommerceReset,
  resolvePinnedVariantForAuction,
} from "@/lib/live-variant-spot-commerce";
import { parseLiveItemSalesFormat } from "@/lib/live-item-variant-serialize";
import { settleAndChargeLiveAuctionLot, resetLiveAuctionLotAfterNoBids } from "@/lib/live-auction-finalize";
import { liveRoomHostCommerceBlockResponse } from "@/lib/live-room-payment-failure";
import { isMultiQuantityLiveAuctionItem } from "@/lib/live-auction-host-start";
import { resolveUnpinnedActiveItemStatus } from "@/lib/resolve-unpinned-active-item-status";
import { applyHighestPreBidToLiveItem } from "@/lib/live-auction-pre-bid";
import {
  emitActiveItemChanged,
  emitActiveItemChangedAwait,
  emitLiveRoomQueueItemsChanged,
  emitPurchaseCompleted,
} from "@/lib/realtime-emit-server";

const STATUSES: LiveRoomItemStatus[] = ["queued", "active", "sold", "skipped"];

function clampItemQuantity(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(512, Math.max(1, Math.floor(n)));
}

function parseQuantity(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return clampItemQuantity(raw);
  if (typeof raw === "string" && raw.trim()) {
    const n = Number(raw.trim());
    if (Number.isFinite(n)) return clampItemQuantity(n);
  }
  return 1;
}

type PatchBody = {
  status?: string;
  currentBidUsd?: number | null;
  startingBidUsd?: number | null;
  priceUsd?: number | null;
  reservePriceUsd?: number | null;
  quantity?: number | string;
  sortOrder?: number;
  /** When `startAuction`, set with `auctionDurationSec` to open timed bidding on the active lot. */
  action?: string;
  auctionDurationSec?: number | string;
  clutchTimeEnabled?: boolean;
  /** `setCommerceFormat` — switch buy_now ↔ auction when lot is idle (non-variant items). */
  salesFormat?: string;
  activeSpotCommerceMode?: string;
};

function describeItemPatchFailure(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? "");
  const msg = raw.trim();
  if (!msg) return "Could not update item.";
  const lower = msg.toLowerCase();
  if (lower.includes("biddingopen") || lower.includes("auctionendsat") || lower.includes("clutchtimeenabled")) {
    return "Could not update item: server schema/client is stale. Run `npx prisma migrate deploy`, `npx prisma generate`, then restart the dev server.";
  }
  if (lower.includes("unknown arg") || lower.includes("invalid") || lower.includes("does not exist")) {
    return `Could not update item: ${msg}`;
  }
  return "Could not update item.";
}

/** Maps Prisma / infra errors from `startAuction` into something hosts can act on. */
function describeStartAuctionFailure(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? "");
  const msg = raw.trim();
  const lower = msg.toLowerCase();
  /** P2022 or Postgres “column does not exist” — almost always missing migration on this DB. */
  const looksLikeMissingColumn =
    lower.includes("p2022") ||
    (lower.includes("column") && (lower.includes("does not exist") || lower.includes("doesn't exist"))) ||
    (lower.includes("unknown field") &&
      (lower.includes("biddingopen") || lower.includes("auctionendsat") || lower.includes("clutchtimeenabled")));
  if (looksLikeMissingColumn) {
    return "Could not start bidding: the database may be missing newer columns. Run `npx prisma migrate deploy`, then `npx prisma generate`, and restart the server.";
  }
  const generic = describeItemPatchFailure(e);
  if (generic !== "Could not update item.") return generic.replace(/^Could not update item/, "Could not start bidding");
  if (!msg) return "Could not start bidding.";
  return `Could not start bidding: ${msg.slice(0, 280)}`;
}

/** Set `LIVE_AUCTION_TIMING_DEBUG=1` for start-bidding transaction / snapshot timings. */
function logStartAuctionTiming(phase: string, elapsedMs: number, extra?: Record<string, unknown>) {
  if (process.env.LIVE_AUCTION_TIMING_DEBUG !== "1") return;
  console.info("[start-auction-timing]", phase, { elapsedMs, ...extra });
}

const BREAK_FINALIZE_TX_OPTS = { timeout: 20_000, maxWait: 10_000 } as const;
const START_BIDDING_TX_OPTS = { timeout: 8_000, maxWait: 5_000 } as const;

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  const { id: roomRaw, itemId: itemRaw } = await ctx.params;
  const liveRoomId = decodeURIComponent(roomRaw);
  const itemId = decodeURIComponent(itemRaw);

  const hostAuth = await requireLiveRoomHostUser(liveRoomId, req);
  if (hostAuth instanceof NextResponse) return hostAuth;
  const { room } = hostAuth;
  if (room.status === "ended") {
    return NextResponse.json({ error: "This room has ended. You cannot change the queue." }, { status: 409 });
  }

  const item = await prisma.liveRoomItem.findFirst({
    where: { id: itemId, liveRoomId },
    select: {
      id: true,
      status: true,
      itemVersion: true,
      biddingOpen: true,
      auctionEndsAt: true,
      lastHighBidderId: true,
      salesFormat: true,
      quantity: true,
      quantityInitial: true,
      variantSpotCommerceDefault: true,
      activeSpotCommerceMode: true,
      auctionVariantId: true,
      variantAssignmentMode: true,
      variants: {
        where: { quantityRemaining: { gt: 0 }, status: { not: "sold_out" } },
        select: { id: true, isHot: true, quantityRemaining: true, status: true, priceUsd: true },
      },
    },
  });
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action.trim() : "";

  const status = typeof body.status === "string" ? body.status.trim() : "";
  const hostCommerceBlocked =
    action === "beginTeamBreak" ||
    action === "setCommerceFormat" ||
    action === "setActiveSpotCommerceMode" ||
    action === "startAuction" ||
    status === "active";
  if (hostCommerceBlocked) {
    const block = await liveRoomHostCommerceBlockResponse(liveRoomId);
    if (block) return block;
  }

  if (action === "beginTeamBreak") {
    const result = await beginVariantTeamBreak(liveRoomId, itemId, room.sellerId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
    const itemDto = await getLiveRoomItemSnapshotDto(itemId);
    return NextResponse.json({ ok: true, itemVersion: result.itemVersion, item: itemDto });
  }

  if (action === "setCommerceFormat") {
    if (item.biddingOpen) {
      return NextResponse.json({ error: "End the live round before switching sale mode." }, { status: 409 });
    }
    if (isVariantSalesFormat(item.salesFormat)) {
      return NextResponse.json({ error: "Use spot commerce controls on PYT/PYD boards." }, { status: 400 });
    }
    const nextFormat = parseLiveItemSalesFormat(body.salesFormat);
    if (nextFormat !== "buy_now" && nextFormat !== "auction") {
      return NextResponse.json({ error: "salesFormat must be buy_now or auction." }, { status: 400 });
    }
    await prisma.liveRoomItem.update({
      where: { id: itemId },
      data: {
        salesFormat: nextFormat,
        biddingOpen: false,
        auctionEndsAt: null,
        currentBidUsd: null,
        lastHighBidderId: null,
        itemVersion: { increment: 1 },
      },
    });
    emitLiveRoomQueueItemsChanged(liveRoomId);
    const itemDto = await getLiveRoomItemSnapshotDto(itemId);
    return NextResponse.json({ ok: true, item: itemDto });
  }

  if (action === "setActiveSpotCommerceMode") {
    if (!isVariantSalesFormat(item.salesFormat)) {
      return NextResponse.json({ error: "Spot commerce mode applies to PYT/PYD items only." }, { status: 400 });
    }
    if (item.biddingOpen) {
      return NextResponse.json({ error: "End the live auction before switching spot mode." }, { status: 409 });
    }
    const mode = body.activeSpotCommerceMode === "auction" ? "auction" : "fixed";
    await prisma.liveRoomItem.update({
      where: { id: itemId },
      data: { activeSpotCommerceMode: mode, itemVersion: { increment: 1 } },
    });
    emitLiveRoomQueueItemsChanged(liveRoomId);
    const itemDto = await getLiveRoomItemSnapshotDto(itemId);
    return NextResponse.json({ ok: true, item: itemDto });
  }

  if (action === "startAuction") {
    const rawDur = body.auctionDurationSec;
    const n =
      typeof rawDur === "number" && Number.isFinite(rawDur)
        ? Math.floor(rawDur)
        : typeof rawDur === "string" && rawDur.trim()
          ? Math.floor(Number(rawDur.trim()))
          : NaN;
    if (!Number.isFinite(n) || n < 3 || n > 7200) {
      return NextResponse.json({ error: "auctionDurationSec must be a number from 3 to 7200 (seconds)." }, { status: 400 });
    }
    if (room.status !== "live") {
      return NextResponse.json({ error: "Start your live show first, then open bidding on the lot." }, { status: 409 });
    }
    if (
      !isLiveRoomBroadcastOnAir({
        status: room.status,
        streamHealth: room.streamHealth,
        streamPaused: room.streamPaused,
      })
    ) {
      return NextResponse.json(
        { error: "Start your broadcast before opening bidding. Buyers need to see you live first." },
        { status: 409 },
      );
    }
    if (item.status !== "active") {
      return NextResponse.json({ error: "Post this lot first, then start bidding." }, { status: 409 });
    }
    if (isVariantSalesFormat(item.salesFormat)) {
      const pinned = resolvePinnedVariantForAuction({
        salesFormat: item.salesFormat,
        variantAssignmentMode: item.variantAssignmentMode,
        variants: item.variants,
      });
      if (!pinned) {
        return NextResponse.json(
          { error: "Pin a team or division on the board before starting an auction." },
          { status: 409 },
        );
      }
      const clutchTimeEnabled = body.clutchTimeEnabled === true;
      const now = new Date();
      const ends = new Date(now.getTime() + n * 1000);
      const openingBid = pinned.priceUsd > 0 ? pinned.priceUsd : 1;
      try {
        const next = await prisma.$transaction(async (tx) => {
          const u = await tx.liveRoomItem.updateMany({
            where: { id: itemId, liveRoomId, status: "active", biddingOpen: false },
            data: {
              biddingOpen: true,
              auctionEndsAt: ends,
              clutchTimeEnabled,
              activeSpotCommerceMode: "auction",
              auctionVariantId: pinned.id,
              startingBidUsd: openingBid,
              currentBidUsd: null,
              lastHighBidderId: null,
              itemVersion: { increment: 1 },
            },
          });
          if (u.count === 0) throw new Error("START_AUCTION_CONFLICT");
          const roomNext = await tx.liveRoom.update({
            where: { id: liveRoomId },
            data: { roomVersion: { increment: 1 } },
            select: { roomVersion: true },
          });
          const itemNext = await tx.liveRoomItem.findUnique({ where: { id: itemId }, select: { itemVersion: true } });
          return {
            roomVersion: roomNext.roomVersion,
            itemVersion: itemNext?.itemVersion ?? item.itemVersion + 1,
          };
        }, START_BIDDING_TX_OPTS);

        const [, itemDto] = await Promise.all([
          emitActiveItemChangedAwait(liveRoomId, itemId, {
            roomVersion: next.roomVersion,
            itemVersion: next.itemVersion,
            biddingOpen: true,
            auctionEndsAt: ends.toISOString(),
          }).catch(() => null),
          getLiveRoomItemSnapshotDto(itemId),
        ]);

        return NextResponse.json({
          ok: true,
          auctionEndsAt: ends.toISOString(),
          serverNowMs: Date.now(),
          roomVersion: next.roomVersion,
          itemVersion: next.itemVersion,
          biddingOpen: true,
          clutchTimeEnabled,
          item: itemDto,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "START_AUCTION_CONFLICT") {
          return NextResponse.json({ error: "Could not start bidding (lot changed). Refresh and try again." }, { status: 409 });
        }
        console.error("[live-room item PATCH startAuction variant]", e);
        return NextResponse.json({ error: describeStartAuctionFailure(e) }, { status: 500 });
      }
    }
    const clutchTimeEnabled = body.clutchTimeEnabled === true;
    const now = new Date();
    if (item.biddingOpen && item.auctionEndsAt && item.auctionEndsAt > now) {
      return NextResponse.json({ error: "Bidding is already open for this lot." }, { status: 409 });
    }
    const ends = new Date(now.getTime() + n * 1000);
    try {
      const needsBreakPriorFinalize =
        room.roomType === "break" &&
        item.biddingOpen === true &&
        item.auctionEndsAt != null &&
        item.auctionEndsAt <= now;

      let fin: BreakRoundFinalizeResult = { finalized: false, skipStartAuction: false };
      let breakChargePaymentStatus: string | undefined;
      if (needsBreakPriorFinalize) {
        const tBreak0 = Date.now();
        fin = await prisma.$transaction(
          async (tx) =>
            finalizeBreakAuctionRoundIfEnded(tx, {
              liveRoomId,
              liveRoomItemId: itemId,
              sellerId: room.sellerId,
            }),
          BREAK_FINALIZE_TX_OPTS,
        );
        logStartAuctionTiming("break_finalize_tx", Date.now() - tBreak0, {
          finalized: fin.finalized,
          skipStartAuction: fin.skipStartAuction,
        });
        if (fin.pendingWinNotifications) {
          try {
            const charge = await sendBreakAuctionWinNotificationsDeferred(fin.pendingWinNotifications);
            breakChargePaymentStatus =
              charge.outcome === "paid"
                ? "paid"
                : charge.outcome === "requires_action" || charge.outcome === "processing"
                  ? "requires_action"
                  : charge.outcome === "error"
                    ? "payment_failed"
                    : "pending";
          } catch (err) {
            console.error("[live-room item PATCH startAuction] win charge/notify", err);
            breakChargePaymentStatus = "payment_failed";
          }
        }
        if (fin.finalized && fin.orderId && breakChargePaymentStatus && !fin.skipStartAuction) {
          const [roomRow, itemRow] = await Promise.all([
            prisma.liveRoom.findUnique({ where: { id: liveRoomId }, select: { roomVersion: true } }),
            prisma.liveRoomItem.findUnique({ where: { id: itemId }, select: { itemVersion: true } }),
          ]);
          emitPurchaseCompleted(liveRoomId, itemId, {
            roomVersion: roomRow?.roomVersion ?? room.roomVersion,
            itemVersion: itemRow?.itemVersion ?? item.itemVersion,
            orderId: fin.orderId,
            paymentStatus: breakChargePaymentStatus,
            itemSoldOut: false,
          });
        }
      }

      if (fin.skipStartAuction) {
        const tSnap0 = Date.now();
        const [roomRow, itemRow] = await Promise.all([
          prisma.liveRoom.findUnique({ where: { id: liveRoomId }, select: { roomVersion: true } }),
          prisma.liveRoomItem.findUnique({ where: { id: itemId }, select: { itemVersion: true } }),
        ]);
        const next = {
          mode: "sold_out" as const,
          roomVersion: roomRow?.roomVersion ?? room.roomVersion,
          itemVersion: itemRow?.itemVersion ?? item.itemVersion,
          orderId: fin.orderId,
        };
        const itemDto = await getLiveRoomItemSnapshotDto(itemId);
        logStartAuctionTiming("post_commit_snapshot_soldout", Date.now() - tSnap0);

        /** Broadcast immediately so buyers are not gated on `after()` / response completion latency. */
        try {
          emitActiveItemChanged(liveRoomId, itemId, {
            roomVersion: next.roomVersion,
            itemVersion: next.itemVersion,
            biddingOpen: false,
            auctionEndsAt: null,
          });
          emitLiveRoomQueueItemsChanged(liveRoomId);
          emitPurchaseCompleted(liveRoomId, itemId, {
            roomVersion: next.roomVersion,
            itemVersion: next.itemVersion,
            orderId: fin.orderId ?? null,
            ...(breakChargePaymentStatus ? { paymentStatus: breakChargePaymentStatus } : {}),
          });
        } catch (emitErr) {
          console.error("[live-room item PATCH startAuction] realtime emit failed (non-fatal)", emitErr);
        }

        const serverNowMs = Date.now();
        return NextResponse.json({
          ok: true,
          breakRoundClosed: true,
          serverNowMs,
          roomVersion: next.roomVersion,
          itemVersion: next.itemVersion,
          biddingOpen: false,
          auctionEndsAt: null,
          clutchTimeEnabled: false,
          item: itemDto,
        });
      }

      const tOpen0 = Date.now();
      const next = await prisma.$transaction(
        async (tx) => {
          // Clear any prior-round high before applying pre-bids for this open (matches variant path).
          await tx.liveRoomItem.updateMany({
            where: { id: itemId, liveRoomId, status: "active" },
            data: { currentBidUsd: null, lastHighBidderId: null },
          });
          await applyHighestPreBidToLiveItem(tx, { liveRoomId, itemId });
          const u = await tx.liveRoomItem.updateMany({
            where: { id: itemId, liveRoomId, status: "active" },
            data: { biddingOpen: true, auctionEndsAt: ends, clutchTimeEnabled, itemVersion: { increment: 1 } },
          });
          if (u.count === 0) throw new Error("START_AUCTION_CONFLICT");
          const roomNext = await tx.liveRoom.update({
            where: { id: liveRoomId },
            data: { roomVersion: { increment: 1 } },
            select: { roomVersion: true },
          });
          const itemNext = await tx.liveRoomItem.findUnique({ where: { id: itemId }, select: { itemVersion: true } });
          return {
            roomVersion: roomNext.roomVersion,
            itemVersion: itemNext?.itemVersion ?? item.itemVersion + 1,
          };
        },
        START_BIDDING_TX_OPTS,
      );
      logStartAuctionTiming("open_bidding_tx", Date.now() - tOpen0);

      /** Await broadcast (buyers see bidding open) in parallel with snapshot read — total wall time ≈ max(emit, snapshot). */
      const tSnap1 = Date.now();
      const [, itemDto] = await Promise.all([
        emitActiveItemChangedAwait(liveRoomId, itemId, {
          roomVersion: next.roomVersion,
          itemVersion: next.itemVersion,
          biddingOpen: true,
          auctionEndsAt: ends.toISOString(),
        }).catch((emitErr) => {
          console.error("[live-room item PATCH startAuction] realtime emit failed (non-fatal)", emitErr);
          return null;
        }),
        getLiveRoomItemSnapshotDto(itemId),
      ]);
      logStartAuctionTiming("post_commit_snapshot_started", Date.now() - tSnap1);

      const serverNowMs = Date.now();
      return NextResponse.json({
        ok: true,
        auctionEndsAt: ends.toISOString(),
        serverNowMs,
        roomVersion: next.roomVersion,
        itemVersion: next.itemVersion,
        biddingOpen: true,
        clutchTimeEnabled,
        item: itemDto,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "START_AUCTION_CONFLICT") {
        return NextResponse.json({ error: "Could not start bidding (lot changed). Refresh and try again." }, { status: 409 });
      }
      console.error("[live-room item PATCH startAuction]", e);
      return NextResponse.json({ error: describeStartAuctionFailure(e) }, { status: 500 });
    }
  }

  if (status && !STATUSES.includes(status as LiveRoomItemStatus)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  if (status === "active") {
    try {
      const roomForFinalize = await prisma.liveRoom.findUnique({
        where: { id: liveRoomId },
        select: { sellerId: true, roomType: true, roomVersion: true },
      });
      if (
        roomForFinalize &&
        (roomForFinalize.roomType === "auction" ||
          roomForFinalize.roomType === "break" ||
          roomForFinalize.roomType === "sale")
      ) {
        const { finalizeOverdueLiveAuctionLotsForRoom } = await import("@/lib/live-auction-finalize");
        await finalizeOverdueLiveAuctionLotsForRoom({
          liveRoomId,
          room: roomForFinalize,
          trigger: "host_pin_lot",
        });
      }

      const currentActive = await prisma.liveRoomItem.findFirst({
        where: { liveRoomId, status: "active", id: { not: itemId } },
        select: { id: true, salesFormat: true, biddingOpen: true, auctionEndsAt: true },
      });
      const auctionStillLive =
        currentActive?.biddingOpen === true &&
        !isVariantSalesFormat(currentActive.salesFormat) &&
        (currentActive.auctionEndsAt == null || currentActive.auctionEndsAt.getTime() > Date.now());
      if (auctionStillLive) {
        return NextResponse.json(
          { error: "End the live auction before pinning another lot." },
          { status: 409 },
        );
      }

      const switched = await prisma.$transaction(async (tx) => {
        const priorActiveRows = await tx.liveRoomItem.findMany({
          where: { liveRoomId, id: { not: itemId }, status: "active" },
          select: {
            id: true,
            title: true,
            salesFormat: true,
            quantity: true,
            quantityInitial: true,
            status: true,
            variants: { select: { quantityRemaining: true, status: true } },
          },
        });
        for (const prior of priorActiveRows) {
          const nextStatus = resolveUnpinnedActiveItemStatus(prior);
          await tx.liveRoomItem.updateMany({
            where: { id: prior.id, liveRoomId, status: "active" },
            data: {
              status: nextStatus,
              biddingOpen: false,
              auctionEndsAt: null,
              itemVersion: { increment: 1 },
            },
          });
        }
        const target = await tx.liveRoomItem.updateMany({
          where: { id: itemId, liveRoomId, status: { in: ["queued", "active"] } },
          data: {
            status: "active",
            biddingOpen: false,
            auctionEndsAt: null,
            clutchTimeEnabled: false,
            variantBreakReadyAt: null,
            variantBreakBeganAt: null,
            itemVersion: { increment: 1 },
          },
        });
        if (target.count === 0) throw new Error("ACTIVE_SWITCH_CONFLICT");
        await applyHighestPreBidToLiveItem(tx, { liveRoomId, itemId });
        const roomNext = await tx.liveRoom.update({
          where: { id: liveRoomId },
          data: { roomVersion: { increment: 1 } },
          select: { roomVersion: true },
        });
        const itemNext = await tx.liveRoomItem.findUnique({
          where: { id: itemId },
          select: { itemVersion: true },
        });
        return { roomVersion: roomNext.roomVersion, itemVersion: itemNext?.itemVersion ?? item.itemVersion + 1 };
      });
      emitActiveItemChanged(liveRoomId, itemId, {
        ...switched,
        biddingOpen: false,
        auctionEndsAt: null,
      });
      emitLiveRoomQueueItemsChanged(liveRoomId);
      return NextResponse.json({ ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "ACTIVE_SWITCH_CONFLICT") {
        return NextResponse.json({ error: "Could not activate item due to concurrent updates. Refresh and retry." }, { status: 409 });
      }
      console.error("[live-room item PATCH active]", e);
      return NextResponse.json({ error: "Could not switch active item." }, { status: 500 });
    }
  }

  const data: {
    status?: LiveRoomItemStatus;
    currentBidUsd?: number | null;
    startingBidUsd?: number | null;
    priceUsd?: number | null;
    reservePriceUsd?: number | null;
    quantity?: number;
    quantityInitial?: number;
    sortOrder?: number;
    biddingOpen?: boolean;
    auctionEndsAt?: Date | null;
    clutchTimeEnabled?: boolean;
  } = {};

  const pricingLocked = item.biddingOpen || item.status === "sold";
  const quantityEditable = !pricingLocked && (item.status === "queued" || item.status === "active");

  if (status) data.status = status as LiveRoomItemStatus;
  if (!pricingLocked) {
    // `currentBidUsd` drives the winning sale price at settlement (see
    // live-room-item-unit-sale.ts / live-variant-spot-auction-settle.ts), so it must never be
    // client-writable once bidding has opened or the lot is sold — real bids only ever set it
    // via the validated `/bid` route. Editable here solely to let a host reset/clear it while
    // configuring an idle lot (mirrors the other pricing fields below).
    if ("currentBidUsd" in body) {
      if (body.currentBidUsd == null || (typeof body.currentBidUsd === "number" && Number.isFinite(body.currentBidUsd))) {
        data.currentBidUsd = typeof body.currentBidUsd === "number" ? body.currentBidUsd : null;
      }
    }
    if ("startingBidUsd" in body) {
      const sb = body.startingBidUsd;
      if (sb == null) data.startingBidUsd = 1;
      else if (typeof sb === "number" && Number.isFinite(sb) && sb > 0) data.startingBidUsd = sb;
    }
    if ("priceUsd" in body) {
      const px = body.priceUsd;
      data.priceUsd =
        px == null ? null : typeof px === "number" && Number.isFinite(px) && px > 0 ? px : null;
    }
    if ("reservePriceUsd" in body) {
      const rv = body.reservePriceUsd;
      data.reservePriceUsd =
        rv == null ? null : typeof rv === "number" && Number.isFinite(rv) && rv > 0 ? rv : null;
    }
  }
  if (quantityEditable && "quantity" in body) {
    const qty = parseQuantity(body.quantity);
    data.quantity = qty;
    data.quantityInitial = qty;
  }
  if (typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)) {
    data.sortOrder = Math.floor(body.sortOrder);
  }
  if (data.status === "queued" || data.status === "skipped") {
    data.biddingOpen = false;
    data.auctionEndsAt = null;
    data.clutchTimeEnabled = false;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No updates." }, { status: 400 });
  }

  if (
    data.status === "skipped" &&
    item.status === "active" &&
    !item.lastHighBidderId?.trim() &&
    isMultiQuantityLiveAuctionItem(item) &&
    (item.biddingOpen || item.auctionEndsAt != null)
  ) {
    const reset = await resetLiveAuctionLotAfterNoBids({
      liveRoomId,
      itemId,
      trigger: "manual",
    });
    if (reset.reset) {
      return NextResponse.json({ ok: true, itemSoldOut: false, resetAuction: true });
    }
  }

  if (data.status === "sold" && (room.roomType === "auction" || room.roomType === "break")) {
    try {
      const result = await settleAndChargeLiveAuctionLot({
        liveRoomId,
        itemId,
        room: { sellerId: room.sellerId, roomType: room.roomType, roomVersion: room.roomVersion },
        trigger: "manual",
      });
      const autoCharge = result.autoCharge;
      return NextResponse.json({
        ok: true,
        orderId: result.orderId,
        itemSoldOut: result.itemSoldOut,
        autoCharge: { outcome: autoCharge.outcome, ...(autoCharge.outcome === "error" ? { code: autoCharge.code } : {}) },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "ITEM_ALREADY_SOLD" || msg === "ITEM_SOLD_CONFLICT") {
        return NextResponse.json({ error: "Item was already sold by another action." }, { status: 409 });
      }
      if (msg === "ITEM_NOT_ACTIVE") {
        return NextResponse.json({ error: "Only the active item can be marked sold." }, { status: 409 });
      }
      if (msg === "LIVE_AUCTION_NO_WINNER") {
        return NextResponse.json(
          { error: "Cannot mark sold: no winning bidder on record. Ensure bidders are logged (link a listing or place bids while signed in)." },
          { status: 409 },
        );
      }
      if (msg === "LISTING_UNAVAILABLE" || msg === "LISTING_NOT_AVAILABLE") {
        return NextResponse.json({ error: "Listing is not available to settle this auction." }, { status: 409 });
      }
      if (msg === "LIVE_AUCTION_ORDER_MISSING" || msg === "LIVE_AUCTION_SETTLE_NO_LISTING") {
        return NextResponse.json({ error: "Could not create an order for this item. Try again or contact support." }, { status: 500 });
      }
      console.error("[live-room item PATCH sold]", e);
      return NextResponse.json({ error: "Could not settle auction before marking sold." }, { status: 500 });
    }
  }

  try {
    const wasActive = item.status === "active";
    const next = await prisma.$transaction(async (tx) => {
      const updated = await tx.liveRoomItem.updateMany({
        where: { id: itemId, liveRoomId },
        data: { ...data, itemVersion: { increment: 1 } },
      });
      if (updated.count === 0) throw new Error("ITEM_UPDATE_CONFLICT");
      const roomNext = await tx.liveRoom.update({
        where: { id: liveRoomId },
        data: { roomVersion: { increment: 1 } },
        select: { roomVersion: true },
      });
      const itemNext = await tx.liveRoomItem.findUnique({
        where: { id: itemId },
        select: { itemVersion: true },
      });
      return { roomVersion: roomNext.roomVersion, itemVersion: itemNext?.itemVersion ?? item.itemVersion + 1 };
    });
    if (data.status === "sold") emitPurchaseCompleted(liveRoomId, itemId, next);
    if (data.status === "skipped") {
      emitLiveRoomQueueItemsChanged(liveRoomId);
      if (wasActive) {
        const hadNoBids = !item.lastHighBidderId?.trim();
        emitPurchaseCompleted(liveRoomId, itemId, {
          roomVersion: next.roomVersion,
          itemVersion: next.itemVersion,
          noBids: hadNoBids,
        });
        emitActiveItemChanged(liveRoomId, itemId, {
          roomVersion: next.roomVersion,
          itemVersion: next.itemVersion,
          biddingOpen: false,
          auctionEndsAt: null,
        });
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "ITEM_UPDATE_CONFLICT") {
      return NextResponse.json({ error: "Item changed concurrently. Refresh and try again." }, { status: 409 });
    }
    console.error("[live-room item PATCH]", e);
    return NextResponse.json({ error: describeItemPatchFailure(e) }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/** Remove a single queue row (queued or skipped only; not active or sold). */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  const { id: roomRaw, itemId: itemRaw } = await ctx.params;
  const liveRoomId = decodeURIComponent(roomRaw);
  const itemId = decodeURIComponent(itemRaw);

  const hostAuth = await requireLiveRoomHostUser(liveRoomId, req);
  if (hostAuth instanceof NextResponse) return hostAuth;
  const { room } = hostAuth;
  if (room.status === "ended") {
    return NextResponse.json({ error: "This room has ended. You cannot change the queue." }, { status: 409 });
  }

  const item = await prisma.liveRoomItem.findFirst({
    where: { id: itemId, liveRoomId },
    select: { id: true, status: true },
  });
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  if (item.status === "sold") {
    return NextResponse.json({ error: "Cannot delete sold items." }, { status: 409 });
  }

  const wasActive = item.status === "active";

  try {
    const roomVersion = await prisma.$transaction(async (tx) => {
      await tx.breakSpot.updateMany({ where: { liveRoomItemId: itemId }, data: { liveRoomItemId: null } });
      const del = await tx.liveRoomItem.deleteMany({ where: { id: itemId, liveRoomId } });
      if (del.count === 0) throw new Error("DELETE_CONFLICT");
      const roomNext = await tx.liveRoom.update({
        where: { id: liveRoomId },
        data: { roomVersion: { increment: 1 } },
        select: { roomVersion: true },
      });
      return roomNext.roomVersion;
    });
    if (wasActive) {
      emitActiveItemChanged(liveRoomId, itemId, { roomVersion });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "DELETE_CONFLICT") {
      return NextResponse.json({ error: "Item changed concurrently. Refresh and try again." }, { status: 409 });
    }
    console.error("[live-room item DELETE]", e);
    return NextResponse.json({ error: "Could not delete item." }, { status: 500 });
  }

  emitLiveRoomQueueItemsChanged(liveRoomId);
  return NextResponse.json({ ok: true });
}
