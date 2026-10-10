import { NextResponse } from "next/server";
import { listAdminRefundQueue } from "@/lib/admin/admin-refund-queue";
import { requireAdmin } from "@/lib/require-admin";
import { listEscalatedRefundRequests, listStuckProcessingRefundRequests } from "@/services/order-refund-request";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const [requests, stuckRequests, queue] = await Promise.all([
    listEscalatedRefundRequests(100),
    listStuckProcessingRefundRequests(100),
    listAdminRefundQueue(200),
  ]);
  return NextResponse.json({ requests, stuckRequests, queue });
}
