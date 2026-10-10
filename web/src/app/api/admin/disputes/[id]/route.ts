import { NextResponse } from "next/server";
import { normalizeAdminReason } from "@/lib/admin/admin-audit";
import {
  DisputeError,
  prefillDisputeEvidence,
  saveDisputeEvidence,
  setDisputeNote,
  type DisputeEvidenceInput,
} from "@/lib/admin/admin-disputes";
import { requireAdmin } from "@/lib/require-admin";
import { requireAdminPermission } from "@/lib/admin/admin-permissions";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Evidence we can pre-fill from our own order records. */
export async function GET(request: Request, ctx: Ctx) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  return NextResponse.json({ evidence: await prefillDisputeEvidence(decodeURIComponent(id)) });
}

type Body = { action?: string; reason?: string; note?: string; evidence?: DisputeEvidenceInput };

export async function PATCH(request: Request, ctx: Ctx) {
  const gate = await requireAdminPermission("disputes.manage", request);
  if (!gate.ok) return gate.response;
  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    if (body.action === "note") {
      await setDisputeNote({ adminUserId: gate.userId, disputeId: id, note: body.note ?? "" });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "save_draft" || body.action === "submit") {
      const reason = normalizeAdminReason(body.reason);
      if (!reason) return NextResponse.json({ error: "REASON_REQUIRED" }, { status: 400 });
      if (!isStripeConfigured()) return NextResponse.json({ error: "STRIPE_NOT_CONFIGURED" }, { status: 503 });
      const result = await saveDisputeEvidence(getStripe(), {
        adminUserId: gate.userId,
        disputeId: id,
        evidence: body.evidence ?? {},
        submit: body.action === "submit",
        reason,
      });
      return NextResponse.json({ ok: true, ...result });
    }
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    if (e instanceof DisputeError) return NextResponse.json({ error: e.code }, { status: e.status });
    console.error("[admin disputes PATCH]", e);
    return NextResponse.json({ error: "STRIPE_ERROR" }, { status: 502 });
  }
}
