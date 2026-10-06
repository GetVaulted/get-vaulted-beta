import { NextResponse } from "next/server";
import { resolveListingsUserId } from "@/lib/resolve-listings-auth";
import { openTradeDispute } from "@/lib/trade-cash-escrow";

/** POST — open a trade dispute (holds cash release / freezes fulfillment). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveListingsUserId(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  let reason = "";
  try {
    const body = (await req.json()) as { reason?: string };
    reason = typeof body.reason === "string" ? body.reason : "";
  } catch {
    reason = "";
  }

  const result = await openTradeDispute({
    tradeOfferId: decodeURIComponent(id),
    actorUserId: auth.userId,
    reason,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, alreadyDone: result.alreadyDone });
}
