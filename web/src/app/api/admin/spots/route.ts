import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

/** Sold spots for one buyer (`?buyer=@name`) or one show (`?show=<id>`), newest first. */
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;

  const sp = new URL(request.url).searchParams;
  const buyer = (sp.get("buyer") ?? "").trim().replace(/^@/, "");
  const show = (sp.get("show") ?? "").trim();
  if (!buyer && !show) return NextResponse.json({ spots: [] });

  const rows = await prisma.liveItemVariantPurchase.findMany({
    where: {
      ...(buyer ? { buyer: { username: { equals: buyer, mode: "insensitive" as const } } } : {}),
      ...(show ? { liveRoomId: show } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      paymentStatus: true,
      totalUsd: true,
      revealedLabel: true,
      fulfillmentOrderId: true,
      stripePaymentIntentId: true,
      settlementChannel: true,
      createdAt: true,
      buyer: { select: { username: true } },
      variant: { select: { label: true } },
      liveRoom: { select: { id: true, title: true } },
    },
  });
  const itemIds = await prisma.liveItemVariantPurchase.findMany({
    where: { id: { in: rows.map((r) => r.id) } },
    select: { id: true, liveRoomItemId: true },
  });
  const items = await prisma.liveRoomItem.findMany({
    where: { id: { in: itemIds.map((i) => i.liveRoomItemId) } },
    select: { id: true, title: true },
  });
  const itemTitle = new Map(items.map((i) => [i.id, i.title]));
  const itemOf = new Map(itemIds.map((i) => [i.id, i.liveRoomItemId]));

  return NextResponse.json({
    spots: rows.map((r) => ({
      id: r.id,
      buyer: r.buyer.username,
      show: r.liveRoom.title,
      showId: r.liveRoom.id,
      item: itemTitle.get(itemOf.get(r.id) ?? "") ?? "(item)",
      label: r.revealedLabel ?? r.variant.label,
      status: r.paymentStatus,
      totalUsd: r.totalUsd,
      channel: r.settlementChannel ?? (r.stripePaymentIntentId ? "card" : "—"),
      cardPaid: !!r.stripePaymentIntentId,
      hasOrder: !!r.fulfillmentOrderId,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
