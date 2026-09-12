import { NextResponse } from "next/server";
import { resolveListingsUserId } from "@/lib/resolve-listings-auth";
import { confirmTradePartyReceived } from "@/lib/trade-fulfillment";

/** POST — confirm you received your partner's package; both sides → completed. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveListingsUserId(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const result = await confirmTradePartyReceived({
    tradeOfferId: decodeURIComponent(id),
    actorUserId: auth.userId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({
    ok: true,
    alreadyDone: result.alreadyDone,
    completed: result.completed,
  });
}
