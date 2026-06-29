import { NextResponse } from "next/server";
import { EscrowStatus, OrderPaymentMethod } from "@/generated/prisma/enums";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import { emitOrderLifecycleSync } from "@/lib/marketplace/ecosystem-sync";
import { prisma } from "@/lib/prisma";
import { SELLER_COMMERCE_KIND, logSellerCommerceEvent } from "@/lib/seller-commerce-event";
import {
  ORDER_MUST_BE_PAID_BEFORE_FULFILLMENT,
  sellerMayMarkOrderShipped,
} from "@/lib/order-shipping-guards";
import { assertValidEscrowTransition } from "@/services/escrow/state-machine";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);

  const order = await prisma.order.findFirst({
    where: {
      id,
      OR: [{ buyerId: session.user.id }, { sellerId: session.user.id }],
    },
    include: {
      listing: {
        select: {
          id: true,
          title: true,
          status: true,
          buyingFormat: true,
          images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
        },
      },
      buyer: { select: { username: true, email: true } },
      seller: { select: { username: true } },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ order });
}

function trimStr(s: unknown, max: number): string {
  if (typeof s !== "string") return "";
  return s.trim().slice(0, max);
}

/** Seller: mark shipped (optional tracking) or add/update tracking on shipped orders. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);

  let body: { markShipped?: boolean; trackingNumber?: string | null };
  try {
    body = (await req.json()) as { markShipped?: boolean; trackingNumber?: string | null };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const order = await prisma.order.findFirst({
    where: { id, sellerId: session.user.id },
    select: {
      id: true,
      buyerId: true,
      sellerId: true,
      listingId: true,
      status: true,
      paymentStatus: true,
      paymentMethod: true,
      escrowStatus: true,
      listing: { select: { id: true, title: true } },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (order.status === "delivered" || order.status === "cancelled") {
    return NextResponse.json({ error: "This order cannot be updated." }, { status: 400 });
  }

  if (body.markShipped === true) {
    const fulfillGate = sellerMayMarkOrderShipped({
      paymentStatus: order.paymentStatus,
      status: order.status,
    });
    if (!fulfillGate.ok) {
      if (fulfillGate.code === "UNPAID") {
        return NextResponse.json({ error: ORDER_MUST_BE_PAID_BEFORE_FULFILLMENT }, { status: 403 });
      }
      return NextResponse.json({ error: "Order is already shipped or cannot be marked shipped." }, { status: 400 });
    }
    const tn =
      body.trackingNumber === undefined
        ? undefined
        : body.trackingNumber === null
          ? null
          : trimStr(body.trackingNumber, 120) || null;

    const escrowShipData =
      order.paymentMethod === OrderPaymentMethod.escrow &&
      order.escrowStatus === EscrowStatus.buyer_paid
        ? { escrowStatus: EscrowStatus.seller_shipped }
        : {};

    if ("escrowStatus" in escrowShipData) {
      try {
        assertValidEscrowTransition(order.escrowStatus, EscrowStatus.seller_shipped);
      } catch (e) {
        console.error("[orders PATCH markShipped] invalid escrow transition", order.id, e);
        return NextResponse.json({ error: "Invalid order state for marking shipped." }, { status: 409 });
      }
    }

    await prisma.order.update({
      where: { id },
      data: {
        status: "shipped",
        shippedAt: new Date(),
        fulfillmentStatus: "shipped",
        ...(tn !== undefined ? { trackingNumber: tn } : {}),
        ...escrowShipData,
      },
    });
    const lt =
      order.listing.title.length > 80 ? `${order.listing.title.slice(0, 77)}…` : order.listing.title;
    if (typeof tn === "string" && tn.length > 0) {
      await logSellerCommerceEvent({
        sellerId: order.sellerId,
        listingId: order.listing.id,
        orderId: order.id,
        kind: SELLER_COMMERCE_KIND.fulfillmentTrackingAdded,
        title: "Tracking added",
        body: `Tracking ${tn} was saved for “${lt}”.`,
      });
    } else {
      await logSellerCommerceEvent({
        sellerId: order.sellerId,
        listingId: order.listing.id,
        orderId: order.id,
        kind: SELLER_COMMERCE_KIND.fulfillmentInTransit,
        title: "Marked shipped",
        body: `You marked “${lt}” as shipped.${tn ? ` Tracking: ${tn}.` : " Carrier scans will update status to on the way."}`,
      });
    }
    await createNotification(prisma, {
      userId: order.buyerId,
      type: "order_shipped",
      title: "Order shipped",
      body: tn
        ? `“${lt}” was handed to the carrier. Tracking: ${tn}. You'll get another update when it's on the way.`
        : `“${lt}” was marked shipped by the seller. You'll get an update when the carrier scans it in.`,
      href: `/orders/${encodeURIComponent(id)}`,
    });
    emitOrderLifecycleSync({
      orderId: id,
      parties: { sellerId: order.sellerId, buyerId: order.buyerId },
      listingId: order.listingId,
      orderStatus: "shipped",
      paymentStatus: order.paymentStatus,
      extraPayload: { fulfillmentStatus: "shipped" },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.trackingNumber !== undefined && order.status === "shipped") {
    const t = body.trackingNumber === null ? null : trimStr(body.trackingNumber, 120) || null;
    await prisma.order.update({
      where: { id },
      data: { trackingNumber: t },
    });
    const lt =
      order.listing.title.length > 80 ? `${order.listing.title.slice(0, 77)}…` : order.listing.title;
    if (t && t.length > 0) {
      await logSellerCommerceEvent({
        sellerId: order.sellerId,
        listingId: order.listing.id,
        orderId: order.id,
        kind: SELLER_COMMERCE_KIND.fulfillmentTrackingAdded,
        title: "Tracking added",
        body: `Tracking updated to ${t} for “${lt}”.`,
      });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid request." }, { status: 400 });
}
