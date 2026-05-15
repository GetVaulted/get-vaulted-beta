import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { canSellerCreateShippingLabel } from "@/lib/order-shipping-guards";
import { prisma } from "@/lib/prisma";
import { fulfillOrderShippingAfterPayment } from "@/services/shipping";

export const runtime = "nodejs";

/**
 * Seller-triggered Shippo label purchase for a paid order (same path as post-payment automation).
 */
export async function POST(_req: Request, ctx: { params: Promise<{ orderId: string }> }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId: raw } = await ctx.params;
  const orderId = decodeURIComponent(raw);

  const order = await prisma.order.findFirst({
    where: { id: orderId, sellerId: session.user.id },
    select: {
      id: true,
      paymentStatus: true,
      shippoTransactionId: true,
      labelUrl: true,
      fulfillmentStatus: true,
      shippingStatus: true,
      trackingNumber: true,
      trackingUrl: true,
    },
  });
  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }
  const gate = canSellerCreateShippingLabel(order);
  if (!gate.ok) {
    const msg =
      gate.code === "UNPAID"
        ? "Order must be paid before creating a label."
        : "A label already exists for this order.";
    return NextResponse.json({ error: msg, code: gate.code }, { status: 409 });
  }

  try {
    await fulfillOrderShippingAfterPayment(order.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[create-label]", e);
    return NextResponse.json({ error: msg || "Shippo label creation failed." }, { status: 500 });
  }

  const next = await prisma.order.findFirst({
    where: { id: order.id },
    select: {
      shippoTransactionId: true,
      labelUrl: true,
      trackingNumber: true,
      trackingUrl: true,
      fulfillmentStatus: true,
      shippingStatus: true,
    },
  });

  if (next?.fulfillmentStatus === "exception") {
    return NextResponse.json({
      order: next,
      warning:
        "Shippo did not produce a label. Confirm Shippo test token, listing parcel dimensions, and your ship-from address under Account → Seller.",
    });
  }

  return NextResponse.json({ order: next });
}
