import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import {
  adminForceRefundRequest,
  RefundRequestError,
  supportResolveRefundRequest,
} from "@/services/order-refund-request";

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: RouteCtx) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  const requestId = id?.trim();
  if (!requestId) return NextResponse.json({ error: "id required" }, { status: 400 });

  let body: { approve?: boolean; note?: string; forceRefund?: boolean; action?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    if (body.action === "force_refund" || body.forceRefund === true) {
      const request = await adminForceRefundRequest({
        requestId,
        adminUserId: gate.userId,
        note: body.note,
      });
      return NextResponse.json({ request });
    }

    if (typeof body.approve !== "boolean") {
      return NextResponse.json(
        { error: "approve required (or action: force_refund)" },
        { status: 400 },
      );
    }

    const request = await supportResolveRefundRequest({
      requestId,
      adminUserId: gate.userId,
      approve: body.approve,
      note: body.note,
      forceRefund: body.forceRefund === true,
    });
    return NextResponse.json({ request });
  } catch (e) {
    if (e instanceof RefundRequestError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    console.error("[admin refund-requests PATCH]", e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
