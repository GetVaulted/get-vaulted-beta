import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { prisma } from "@/lib/prisma";
import { canBuyerUpdateOrderShipping } from "@/lib/order-shipping-guards";
import { applyBuyerWalletShippingToOrder } from "@/lib/live-buy-now-purchase";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ id: string }> };

function shipToPayload(order: {
  shipRecipientName: string | null;
  shipAddress: string | null;
  shipCity: string | null;
  shipState: string | null;
  shipZip: string | null;
  shipCountry: string | null;
}) {
  return {
    shipRecipientName: order.shipRecipientName,
    shipAddress: order.shipAddress,
    shipCity: order.shipCity,
    shipState: order.shipState,
    shipZip: order.shipZip,
    shipCountry: order.shipCountry,
  };
}

export async function GET(req: Request, ctx: RouteCtx) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  const { id: raw } = await ctx.params;
  const orderId = decodeURIComponent(raw).trim();
  if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });

  const order = await prisma.order.findFirst({
    where: { id: orderId, buyerId: auth.userId },
    select: {
      shipRecipientName: true,
      shipAddress: true,
      shipCity: true,
      shipState: true,
      shipZip: true,
      shipCountry: true,
      status: true,
      labelUrl: true,
      shippoTransactionId: true,
      fulfillmentStatus: true,
      trackingNumber: true,
    },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const gate = canBuyerUpdateOrderShipping(order);
  return NextResponse.json({
    shipTo: shipToPayload(order),
    canUpdateFromWallet: gate.ok,
    blockedReason: gate.ok ? null : gate.code,
  });
}

export async function POST(req: Request, ctx: RouteCtx) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  const { id: raw } = await ctx.params;
  const orderId = decodeURIComponent(raw).trim();
  if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });

  const result = await applyBuyerWalletShippingToOrder(orderId, auth.userId);
  if (!result.ok) {
    const status =
      result.code === "ORDER_NOT_FOUND" || result.code === "FORBIDDEN"
        ? 404
        : result.code === "NO_SHIPPING_ADDRESS"
          ? 400
          : 409;
    const message =
      result.code === "NO_SHIPPING_ADDRESS"
        ? "Add a complete shipping address in Wallet first."
        : result.code === "LABEL_EXISTS"
          ? "A shipping label already exists for this order, so the address cannot be changed."
          : result.code === "ALREADY_SHIPPED"
            ? "This order has already shipped."
            : result.code === "TERMINAL"
              ? "This order can no longer be updated."
              : "Order not found.";
    return NextResponse.json({ error: message, code: result.code }, { status });
  }

  return NextResponse.json({
    ok: true,
    updated: result.updated,
    shipTo: {
      shipRecipientName: result.shipping.shipRecipientName,
      shipAddress: result.shipping.shipAddress,
      shipCity: result.shipping.shipCity,
      shipState: result.shipping.shipState,
      shipZip: result.shipping.shipZip,
      shipCountry: result.shipping.shipCountry,
    },
  });
}
