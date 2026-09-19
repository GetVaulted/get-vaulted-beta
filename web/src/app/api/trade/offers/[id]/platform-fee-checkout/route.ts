import { NextResponse } from "next/server";
import { resolveListingsUserId } from "@/lib/resolve-listings-auth";
import { createTradePlatformFeeCheckout } from "@/lib/trade-platform-fee-checkout";

/** POST — start Stripe Checkout for this party's $2.99 Get Vaulted trade platform fee. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveListingsUserId(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const offerId = decodeURIComponent(id);

  const result = await createTradePlatformFeeCheckout({
    tradeOfferId: offerId,
    payerUserId: auth.userId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  if (result.alreadyPaid) {
    return NextResponse.json({ ok: true, alreadyPaid: true, url: null });
  }
  return NextResponse.json({ ok: true, alreadyPaid: false, url: result.url });
}
