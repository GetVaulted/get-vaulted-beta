import { NextResponse } from "next/server";
import { resolveListingsUserId } from "@/lib/resolve-listings-auth";
import { createTradeDepositCheckout } from "@/lib/trade-deposit-checkout";

/** POST — pay refundable security deposit (straight / $0-cash trades). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveListingsUserId(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const result = await createTradeDepositCheckout({
    tradeOfferId: decodeURIComponent(id),
    payerUserId: auth.userId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  if (result.alreadyPaid) {
    return NextResponse.json({
      ok: true,
      alreadyPaid: true,
      url: null,
      amountUsd: result.amountUsd,
    });
  }
  return NextResponse.json({
    ok: true,
    alreadyPaid: false,
    url: result.url,
    amountUsd: result.amountUsd,
  });
}
