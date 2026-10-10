import { NextResponse } from "next/server";
import { syncDisputesFromStripe } from "@/lib/admin/admin-disputes";
import { logAdminActionSafe } from "@/lib/admin/admin-audit";
import { requireAdminPermission } from "@/lib/admin/admin-permissions";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Pull the latest disputes from Stripe into the local queue. Read-only toward Stripe. */
export async function POST(request: Request) {
  const gate = await requireAdminPermission("disputes.manage", request);
  if (!gate.ok) return gate.response;
  if (!isStripeConfigured()) return NextResponse.json({ error: "STRIPE_NOT_CONFIGURED" }, { status: 503 });
  try {
    const synced = await syncDisputesFromStripe(getStripe());
    await logAdminActionSafe({ adminUserId: gate.userId, action: "dispute.sync", targetType: "dispute", targetId: "all", detail: { synced } });
    return NextResponse.json({ ok: true, synced });
  } catch (e) {
    console.error("[admin disputes sync]", e);
    return NextResponse.json({ error: "SYNC_FAILED" }, { status: 502 });
  }
}
