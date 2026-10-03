import { NextResponse } from "next/server";
import { resolveListingsUserId } from "@/lib/resolve-listings-auth";
import { createTradeCashCheckout } from "@/lib/trade-cash-checkout";

/** POST — start Stripe Checkout for optional on-platform trade cash. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveListingsUserId(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const offerId = decodeURIComponent(id);

  const result = await createTradeCashCheckout({
    tradeOfferId: offerId,
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
    payeeUsername: result.payeeUsername,
    connectDestination: result.connectDestination,
  });
}
