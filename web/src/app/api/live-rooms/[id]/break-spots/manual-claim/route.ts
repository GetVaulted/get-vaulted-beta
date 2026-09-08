import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { getLiveRoomHostAccess } from "@/lib/live-room-host-auth";
import { prisma } from "@/lib/prisma";
import { refreshLiveRoomItemSoldAfterBreakSpotChange } from "@/lib/live-room-break-quantity";
import { emitBreakSpotsChanged, emitLiveRoomMessagesRefetch } from "@/lib/realtime-emit-server";

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

type Body = {
  buyerUserId?: string;
  liveRoomItemId?: string;
  spotLabel?: string;
  priceUsd?: number;
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);

  const access = await getLiveRoomHostAccess(liveRoomId, session.user.id, { requireBreak: true });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const buyerUserId = typeof body.buyerUserId === "string" ? body.buyerUserId.trim() : "";
  if (!buyerUserId) return NextResponse.json({ error: "buyerUserId is required." }, { status: 400 });

  const buyer = await prisma.user.findUnique({
    where: { id: buyerUserId },
    select: { id: true, username: true, suspendedAt: true },
  });
  if (!buyer || buyer.suspendedAt) {
    return NextResponse.json({ error: "Buyer not found or suspended." }, { status: 400 });
  }

  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: { id: true, sellerId: true, status: true },
  });
  if (!room || room.status !== "live") {
    return NextResponse.json({ error: "Room must be live to assign spots." }, { status: 409 });
  }

  const liveRoomItemId = typeof body.liveRoomItemId === "string" ? body.liveRoomItemId.trim() : "";
  const spotLabelRaw = typeof body.spotLabel === "string" ? body.spotLabel.trim().slice(0, 200) : "";
  const priceOverride =
    typeof body.priceUsd === "number" && Number.isFinite(body.priceUsd) && body.priceUsd >= 0 ? body.priceUsd : null;

  try {
    if (liveRoomItemId) {
      const item = await prisma.liveRoomItem.findFirst({
        where: { id: liveRoomItemId, liveRoomId },
        select: { id: true, title: true, priceUsd: true, quantity: true, status: true },
      });
      if (!item) return NextResponse.json({ error: "Queue item not found." }, { status: 404 });
      if (item.status !== "queued" && item.status !== "active") {
        return NextResponse.json({ error: "That spot is not available." }, { status: 409 });
      }

      const qty = Math.max(1, item.quantity);
      const filled = await prisma.breakSpot.count({ where: { liveRoomItemId: item.id } });
      if (filled >= qty) {
        return NextResponse.json({ error: "This lot is fully claimed." }, { status: 409 });
      }

      const price = priceOverride ?? item.priceUsd ?? 0;
      const label = item.title.slice(0, 200);

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
              userId: buyer.id,
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
          await tx.liveRoomMessage.create({
            data: {
              liveRoomId,
              senderId: room.sellerId,
              body: `Host assigned “${label}” to @${buyer.username} for ${formatMoney(price)} (manual claim).`,
              messageType: "system",
            },
          });
        });
      } catch (e) {
        if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "ITEM_FULL") {
          return NextResponse.json({ error: "This lot is fully claimed." }, { status: 409 });
        }
        throw e;
      }

      emitBreakSpotsChanged(liveRoomId);
      emitLiveRoomMessagesRefetch(liveRoomId);
      return NextResponse.json({ ok: true });
    }

    if (!spotLabelRaw) {
      return NextResponse.json({ error: "Provide liveRoomItemId or spotLabel." }, { status: 400 });
    }
    const priceUsd = priceOverride ?? 0;

    await prisma.$transaction(async (tx) => {
      await tx.breakSpot.create({
        data: {
          liveRoomId,
          userId: buyer.id,
          spotLabel: spotLabelRaw,
          priceUsd,
          status: "confirmed",
          claimStatus: "confirmed",
        },
      });
      await tx.liveRoomMessage.create({
        data: {
          liveRoomId,
          senderId: room.sellerId,
          body: `Host assigned “${spotLabelRaw}” to @${buyer.username} for ${formatMoney(priceUsd)} (manual claim).`,
          messageType: "system",
        },
      });
    });

    emitBreakSpotsChanged(liveRoomId);
    emitLiveRoomMessagesRefetch(liveRoomId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "That spot label is already taken." }, { status: 409 });
    }
    console.error(e);
    return NextResponse.json({ error: "Could not assign spot." }, { status: 500 });
  }
}
