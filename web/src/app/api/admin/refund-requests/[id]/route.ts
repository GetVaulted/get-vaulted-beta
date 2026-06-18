import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { RefundRequestError, supportResolveRefundRequest } from "@/services/order-refund-request";

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: RouteCtx) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  const requestId = id?.trim();
  if (!requestId) return NextResponse.json({ error: "id required" }, { status: 400 });

  let body: { approve?: boolean; note?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.approve !== "boolean") {
    return NextResponse.json({ error: "approve required" }, { status: 400 });
  }

  try {
    const request = await supportResolveRefundRequest({
      requestId,
      adminUserId: gate.userId,
      approve: body.approve,
      note: body.note,
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
