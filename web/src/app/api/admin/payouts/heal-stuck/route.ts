import { NextResponse } from "next/server";
import { healStuckBankPayoutEvaluations } from "@/lib/admin/heal-stuck-payout-evaluations";
import { requireAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";

/**
 * POST — Re-run payout-ready evaluation for paid orders stuck at payoutStatus "held" despite
 * already looking shipped. See heal-stuck-payout-evaluations.ts for why this exists. Safe to run
 * repeatedly: it only corrects a status field, it never pushes money anywhere by itself.
 *
 * Each call only works for up to ~7s (see `deadlineMs` in healStuckBankPayoutEvaluations) so a
 * single click can never be killed mid-flight by the platform's function timeout — the response's
 * `hasMore` flag tells the caller whether backlog remains so the admin UI can call again
 * automatically instead of the whole recheck erroring out.
 */
export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const body = (await req.json().catch(() => ({}))) as { limit?: number };
  const limit = typeof body.limit === "number" && Number.isFinite(body.limit) ? body.limit : 500;

  const result = await healStuckBankPayoutEvaluations(limit);
  return NextResponse.json(result);
}
