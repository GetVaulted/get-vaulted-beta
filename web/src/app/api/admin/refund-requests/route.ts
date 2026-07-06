import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { listEscalatedRefundRequests, listStuckProcessingRefundRequests } from "@/services/order-refund-request";

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const [requests, stuckRequests] = await Promise.all([
    listEscalatedRefundRequests(100),
    listStuckProcessingRefundRequests(100),
  ]);
  return NextResponse.json({ requests, stuckRequests });
}
