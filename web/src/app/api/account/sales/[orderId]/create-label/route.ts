import { NextResponse } from "next/server";
import { canSellerCreateShippingLabel, isIncompleteOrderShipping } from "@/lib/order-shipping-guards";
import { refreshBuyerShippingOnOrderIfIncomplete } from "@/lib/live-buy-now-purchase";
import { prisma } from "@/lib/prisma";
import { resolveAccountSellerUserId } from "@/lib/resolve-account-seller-user";
import { fulfillOrderShippingAfterPayment } from "@/services/shipping";
import { parseCreateLabelRequestBody } from "@/lib/shippo-label-format";
import { SELLER_SHIPPO_CONTACT_MISSING, BUYER_SHIPPO_CONTACT_MISSING } from "@/lib/shippo-label-contacts";
import { processLabelCreatedPayoutEvaluation } from "@/services/payout/process-payout-tier-events";

export const runtime = "nodejs";

/**
 * Seller-triggered Shippo label purchase for a paid order.
 */
export async function POST(req: Request, ctx: { params: Promise<{ orderId: string }> }) {
  const auth = await resolveAccountSellerUserId(req);
  if (auth instanceof NextResponse) return auth;

  const { orderId: raw } = await ctx.params;
  const orderId = decodeURIComponent(raw);

  const order = await prisma.order.findFirst({
    where: { id: orderId, sellerId: auth.userId },
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
  const gate = canSellerCreateShippingLabel({
    paymentStatus: order.paymentStatus,
    shippoTransactionId: order.shippoTransactionId,
    labelUrl: order.labelUrl,
    fulfillmentStatus: order.fulfillmentStatus,
  });
  if (!gate.ok) {
    const msg =
      gate.code === "UNPAID"
        ? "Order must be paid before creating a label."
        : "A label already exists for this order.";
    return NextResponse.json({ error: msg, code: gate.code }, { status: 409 });
  }

  const refresh = await refreshBuyerShippingOnOrderIfIncomplete(order.id);
  if (!refresh.ok && refresh.code === "NO_SHIPPING_ADDRESS") {
    return NextResponse.json(
      {
        error:
          "Buyer shipping address is missing or incomplete. Ask the buyer to add a full address in Account → Wallet, then try again.",
        code: "BUYER_ADDRESS_INCOMPLETE",
      },
      { status: 422 },
    );
  }

  const afterRefresh = await prisma.order.findFirst({
    where: { id: order.id },
    select: {
      shipAddress: true,
      shipCity: true,
      shipState: true,
      shipZip: true,
    },
  });
  if (afterRefresh && isIncompleteOrderShipping(afterRefresh)) {
    return NextResponse.json(
      {
        error:
          "Ship-to address on this order is still incomplete. The buyer must save a valid street, city, state, and ZIP in Wallet.",
        code: "BUYER_ADDRESS_INCOMPLETE",
      },
      { status: 422 },
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      labelFormat?: string;
      manualParcel?: { weightOz?: unknown; lengthIn?: unknown; widthIn?: unknown; heightIn?: unknown };
    };
    const labelFormat = parseCreateLabelRequestBody(body);
    const mp = body.manualParcel;
    const manualParcel =
      mp &&
      typeof mp.weightOz === "number" &&
      mp.weightOz > 0 &&
      typeof mp.lengthIn === "number" &&
      mp.lengthIn > 0 &&
      typeof mp.widthIn === "number" &&
      mp.widthIn > 0 &&
      typeof mp.heightIn === "number" &&
      mp.heightIn > 0
        ? {
            weightOz: Math.max(0.1, Number(mp.weightOz)),
            lengthIn: Math.max(0.1, Number(mp.lengthIn)),
            widthIn: Math.max(0.1, Number(mp.widthIn)),
            heightIn: Math.max(0.1, Number(mp.heightIn)),
          }
        : undefined;
    await fulfillOrderShippingAfterPayment(order.id, { labelFormat, manualParcel });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[create-label]", e);
    if (msg === "SHIPPO_NOT_CONFIGURED") {
      return NextResponse.json({ error: "Shippo is not configured.", code: msg }, { status: 503 });
    }
    if (msg === "SELLER_SHIP_FROM_INCOMPLETE") {
      return NextResponse.json(
        { error: "Complete your ship-from address under Account → Seller before creating labels.", code: msg },
        { status: 400 },
      );
    }
    if (msg === "ORDER_NOT_PAID") {
      return NextResponse.json({ error: "Order must be paid before creating a label.", code: msg }, { status: 409 });
    }
    if (msg === SELLER_SHIPPO_CONTACT_MISSING) {
      return NextResponse.json({ error: msg, code: "SELLER_CONTACT_INCOMPLETE" }, { status: 422 });
    }
    if (msg === BUYER_SHIPPO_CONTACT_MISSING) {
      return NextResponse.json({ error: msg, code: "BUYER_CONTACT_INCOMPLETE" }, { status: 422 });
    }
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

  if (next?.shippoTransactionId || next?.labelUrl) {
    void processLabelCreatedPayoutEvaluation(order.id);
  }

  if (next?.fulfillmentStatus === "exception") {
    return NextResponse.json({
      order: next,
      warning:
        "Shippo did not produce a label. Confirm Shippo test token, listing parcel dimensions, and your ship-from address under Account → Seller.",
    });
  }

  return NextResponse.json({ order: next });
}
