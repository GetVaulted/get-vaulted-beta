import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { prisma } from "@/lib/prisma";
import {
  RefundRequestError,
  buyerEscalateRefundRequest,
  buyerSubmitReturnTracking,
  createBuyerRefundRequest,
  getOrderRefundRequestState,
  sellerConfirmReturnReceived,
  sellerDirectCancelRefund,
  sellerRespondToRefundRequest,
} from "@/services/order-refund-request";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ id: string }> };

async function assertOrderParty(orderId: string, userId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, OR: [{ buyerId: userId }, { sellerId: userId }] },
    select: { buyerId: true, sellerId: true },
  });
  if (!order) return null;
  return {
    isBuyer: order.buyerId === userId,
    isSeller: order.sellerId === userId,
  };
}

function errorResponse(e: unknown) {
  if (e instanceof RefundRequestError) {
    return NextResponse.json({ error: e.code }, { status: e.status });
  }
  console.error("[orders refund-request]", e);
  return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
}

export async function GET(req: Request, ctx: RouteCtx) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  const { id: raw } = await ctx.params;
  const orderId = decodeURIComponent(raw).trim();
  if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });

  const party = await assertOrderParty(orderId, auth.userId);
  if (!party) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const state = await getOrderRefundRequestState(orderId);
  if (!state) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    ...state,
    role: party.isBuyer ? "buyer" : "seller",
  });
}

export async function POST(req: Request, ctx: RouteCtx) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  const { id: raw } = await ctx.params;
  const orderId = decodeURIComponent(raw).trim();

  let body: { kind?: string; reason?: string; photoUrls?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const kind = body.kind === "return" ? "return" : body.kind === "cancel" ? "cancel" : null;
  if (!kind) return NextResponse.json({ error: "KIND_REQUIRED" }, { status: 400 });

  try {
    const request = await createBuyerRefundRequest({
      orderId,
      buyerId: auth.userId,
      kind,
      reason: body.reason ?? "",
      photoUrls: body.photoUrls,
    });
    return NextResponse.json({ request });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request, ctx: RouteCtx) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  const { id: raw } = await ctx.params;
  const orderId = decodeURIComponent(raw).trim();

  let body: {
    action?: string;
    approve?: boolean;
    reason?: string;
    denyReason?: string;
    trackingNumber?: string;
    carrier?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action?.trim();
  if (!action) return NextResponse.json({ error: "ACTION_REQUIRED" }, { status: 400 });

  try {
    if (action === "seller_respond") {
      const request = await sellerRespondToRefundRequest({
        orderId,
        sellerId: auth.userId,
        approve: body.approve === true,
        denyReason: body.denyReason,
      });
      return NextResponse.json({ request });
    }
    if (action === "seller_direct_cancel") {
      const request = await sellerDirectCancelRefund({
        orderId,
        sellerId: auth.userId,
        reason: body.reason,
      });
      return NextResponse.json({ request });
    }
    if (action === "buyer_escalate") {
      const request = await buyerEscalateRefundRequest({ orderId, buyerId: auth.userId });
      return NextResponse.json({ request });
    }
    if (action === "buyer_return_tracking") {
      const request = await buyerSubmitReturnTracking({
        orderId,
        buyerId: auth.userId,
        trackingNumber: body.trackingNumber ?? "",
        carrier: body.carrier,
      });
      return NextResponse.json({ request });
    }
    if (action === "seller_confirm_return") {
      const request = await sellerConfirmReturnReceived({ orderId, sellerId: auth.userId });
      return NextResponse.json({ request });
    }
    return NextResponse.json({ error: "UNKNOWN_ACTION" }, { status: 400 });
  } catch (e) {
    return errorResponse(e);
  }
}
