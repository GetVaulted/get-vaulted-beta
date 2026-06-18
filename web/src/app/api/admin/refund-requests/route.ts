import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { listEscalatedRefundRequests } from "@/services/order-refund-request";

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const requests = await listEscalatedRefundRequests(100);
  return NextResponse.json({ requests });
}
