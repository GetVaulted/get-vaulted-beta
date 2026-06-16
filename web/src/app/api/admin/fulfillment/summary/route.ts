import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const [
    openOrders,
    paidOrders,
    shippedOrders,
    deliveredOrders,
    disputedOrders,
    activeLayaways,
    readyToShipLayaways,
  ] = await Promise.all([
    prisma.order.count({ where: { status: "pending" } }),
    prisma.order.count({ where: { status: "paid" } }),
    prisma.order.count({ where: { status: "shipped" } }),
    prisma.order.count({ where: { status: "completed", fulfillmentStatus: "delivered" } }),
    prisma.order.count({
      where: {
        OR: [{ status: "disputed" }, { escrowStatus: "disputed" }],
      },
    }),
    prisma.layaway.count({ where: { status: "active" } }),
    prisma.layaway.count({
      where: {
        status: "paid_off",
        order: { fulfillmentStatus: { in: ["pending", "label_created"] } },
      },
    }),
  ]);

  return NextResponse.json({
    openOrders,
    paidOrders,
    shippedOrders,
    deliveredOrders,
    disputedOrders,
    activeLayaways,
    readyToShipLayaways,
  });
}
