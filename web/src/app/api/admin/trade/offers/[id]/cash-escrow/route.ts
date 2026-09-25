import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import {
  adminResolveTradeEscrow,
  type AdminTradeEscrowAction,
} from "@/lib/trade-cash-escrow";

const ACTIONS = new Set<AdminTradeEscrowAction>(["release", "refund", "resolve_complete", "reinstate"]);

/** POST — admin trade cash escrow: release | refund | resolve_complete | reinstate. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  let action: string | undefined;
  try {
    const body = (await req.json()) as { action?: string };
    action = typeof body.action === "string" ? body.action.trim() : undefined;
  } catch {
    action = undefined;
  }

  if (!action || !ACTIONS.has(action as AdminTradeEscrowAction)) {
    return NextResponse.json(
      { error: "action must be one of: release, refund, resolve_complete, reinstate." },
      { status: 400 },
    );
  }

  const result = await adminResolveTradeEscrow({
    tradeOfferId: decodeURIComponent(id),
    adminUserId: gate.userId,
    action: action as AdminTradeEscrowAction,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({
    ok: true,
    alreadyDone: result.alreadyDone,
    transferId: result.transferId ?? null,
    refundId: result.refundId ?? null,
    pendingConnect: result.pendingConnect ?? false,
  });
}
