import { NextResponse } from "next/server";
import { liveRoomPaymentBlockResponse } from "@/lib/live-room-payment-failure";
import { getLiveRoomBroadcastCommerceBlock } from "@/lib/live-room-commerce-guards";
import { getServerSessionSafe } from "@/lib/auth";
import { liveWalletIncompleteOrNull } from "@/lib/buyer-live-wallet-readiness";
import { prisma } from "@/lib/prisma";
import { isStripeConfigured } from "@/lib/stripe";
import { refreshLiveRoomItemSoldAfterBreakSpotChange } from "@/lib/live-room-break-quantity";
import { emitBreakSpotsChanged, emitLiveRoomMessagesRefetch } from "@/lib/realtime-emit-server";

function signInUrl(returnPath: string) {
  return `/signin?returnTo=${encodeURIComponent(returnPath)}`;
}

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

type Body = { liveRoomItemId?: string; spotLabel?: string; priceUsd?: unknown };

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSessionSafe();
  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);
  const returnPath = `/live/${encodeURIComponent(liveRoomId)}`;

  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: {
      id: true,
      sellerId: true,
      roomType: true,
      status: true,
      breakPaused: true,
      lockPurchases: true,
      breakFilledLockedAt: true,
      streamHealth: true,
      streamPaused: true,
      streamMode: true,
      streamStartedAt: true,
      streamEndedAt: true,
    },
  });
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  if (room.roomType !== "break") {
    return NextResponse.json({ error: "Spot claims are only for break rooms." }, { status: 400 });
  }
  if (room.status !== "live") {
    return NextResponse.json({ error: "This room is not live." }, { status: 409 });
  }
  const broadcastBlock = getLiveRoomBroadcastCommerceBlock(room, "purchase");
  if (broadcastBlock) {
    return NextResponse.json({ error: broadcastBlock.error, code: broadcastBlock.code }, { status: broadcastBlock.status });
  }
  if (room.breakPaused) {
    return NextResponse.json({ error: "This break is paused by the host." }, { status: 409 });
  }
  if (room.lockPurchases) {
    return NextResponse.json({ error: "Purchases are locked for this room." }, { status: 409 });
  }
  if (room.breakFilledLockedAt) {
    return NextResponse.json({ error: "This break is locked (filled)." }, { status: 409 });
  }

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to claim a spot.", signInUrl: signInUrl(returnPath) }, { status: 401 });
  }
  const paymentBlock = await liveRoomPaymentBlockResponse(liveRoomId, session.user.id);
  if (paymentBlock) return paymentBlock;
  if (room.sellerId === session.user.id) {
    return NextResponse.json({ error: "You cannot claim spots in your own break room." }, { status: 400 });
  }

  if (isStripeConfigured()) {
    const wallet = await liveWalletIncompleteOrNull(session.user.id);
    if (wallet) {
      return NextResponse.json(wallet, { status: 402 });
    }
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const liveRoomItemId = typeof body.liveRoomItemId === "string" ? body.liveRoomItemId.trim() : "";
  const spotLabelRaw = typeof body.spotLabel === "string" ? body.spotLabel.trim().slice(0, 200) : "";
  const priceUsd =
    typeof body.priceUsd === "number" && Number.isFinite(body.priceUsd) && body.priceUsd >= 0
      ? body.priceUsd
      : NaN;

  try {
    if (liveRoomItemId) {
      const item = await prisma.liveRoomItem.findFirst({
        where: { id: liveRoomItemId, liveRoomId },
        select: {
          id: true,
          title: true,
          priceUsd: true,
          quantity: true,
          status: true,
          biddingOpen: true,
          auctionEndsAt: true,
        },
      });
      if (!item) return NextResponse.json({ error: "Spot not found." }, { status: 404 });
      if (item.status !== "queued" && item.status !== "active") {
        return NextResponse.json({ error: "That spot is no longer available." }, { status: 409 });
      }
      if (item.status === "active") {
        if (!item.biddingOpen) {
          return NextResponse.json({ error: "The host has not started bidding on this lot yet." }, { status: 409 });
        }
        if (item.auctionEndsAt && item.auctionEndsAt <= new Date()) {
          return NextResponse.json({ error: "The bidding window for this lot has ended." }, { status: 409 });
        }
      }
      const price = item.priceUsd ?? 0;
      const label = item.title.slice(0, 200);

      const qty = Math.max(1, item.quantity);
      const already = await prisma.breakSpot.findFirst({
        where: { liveRoomId, liveRoomItemId: item.id, userId: session.user.id },
        select: { id: true },
      });
      if (qty <= 1 && already) {
        return NextResponse.json({ error: "You already claimed this spot." }, { status: 409 });
      }

      try {
        await prisma.$transaction(async (tx) => {
          const taken = await tx.breakSpot.count({ where: { liveRoomItemId: item.id } });
          if (taken >= qty) {
            throw Object.assign(new Error("ITEM_FULL"), { code: "ITEM_FULL" });
          }

          const ordinal = taken + 1;
          const spotLabel =
            qty > 1
              ? `${label.slice(0, 120)} · ${ordinal}/${qty} · ${item.id.slice(-8)}`
              : label;

          const created = await tx.breakSpot.create({
            data: {
              liveRoomId,
              userId: session.user.id,
              spotLabel,
              priceUsd: price,
              status: "confirmed",
              claimStatus: "confirmed",
              liveRoomItemId: item.id,
            },
          });

          const after = await tx.breakSpot.count({ where: { liveRoomItemId: item.id } });
          if (after > qty) {
            await tx.breakSpot.delete({ where: { id: created.id } });
            throw Object.assign(new Error("ITEM_FULL"), { code: "ITEM_FULL" });
          }

          await refreshLiveRoomItemSoldAfterBreakSpotChange(tx, item.id);
          const u = await tx.user.findUnique({ where: { id: session.user.id }, select: { username: true } });
          const un = u?.username ?? "Buyer";
          await tx.liveRoomMessage.create({
            data: {
              liveRoomId,
              senderId: session.user.id,
              body: `${un} claimed “${label}” for ${formatMoney(price)}`,
              messageType: "purchase",
            },
          });
        });
      } catch (e) {
        if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "ITEM_FULL") {
          return NextResponse.json({ error: "That lot is fully claimed." }, { status: 409 });
        }
        throw e;
      }

      emitBreakSpotsChanged(liveRoomId);
      emitLiveRoomMessagesRefetch(liveRoomId);
      return NextResponse.json({ ok: true });
    }

    if (!spotLabelRaw || !(priceUsd >= 0)) {
      return NextResponse.json({ error: "spotLabel and priceUsd are required." }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.breakSpot.create({
        data: {
          liveRoomId,
          userId: session.user.id,
          spotLabel: spotLabelRaw,
          priceUsd: priceUsd,
          status: "confirmed",
          claimStatus: "confirmed",
        },
      });
      const u = await tx.user.findUnique({ where: { id: session.user.id }, select: { username: true } });
      const un = u?.username ?? "Buyer";
      await tx.liveRoomMessage.create({
        data: {
          liveRoomId,
          senderId: session.user.id,
          body: `${un} claimed “${spotLabelRaw}” for ${formatMoney(priceUsd)}`,
          messageType: "purchase",
        },
      });
    });

    emitBreakSpotsChanged(liveRoomId);
    emitLiveRoomMessagesRefetch(liveRoomId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "That spot was just claimed." }, { status: 409 });
    }
    console.error(e);
    return NextResponse.json({ error: "Could not claim spot." }, { status: 500 });
  }
}
