import { NextResponse } from "next/server";
import { resolveListingsUserId } from "@/lib/resolve-listings-auth";
import { GET_VAULTED_TRADE_PLATFORM_FEE_USD } from "@/lib/trade-platform-fee";
import { fetchTradeOutboundShippingQuote } from "@/lib/trade-shipping-quote";

/** POST — quote payer's outbound Shippo rate for combined fee + label checkout. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveListingsUserId(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const offerId = decodeURIComponent(id);

  const result = await fetchTradeOutboundShippingQuote({
    tradeOfferId: offerId,
    payerUserId: auth.userId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const shippingUsd = result.quote.amountUsd;
  return NextResponse.json({
    shippingUsd,
    shippingCents: result.quote.amountCents,
    carrier: result.quote.carrier,
    serviceLevel: result.quote.serviceLevel,
    platformFeeUsd: GET_VAULTED_TRADE_PLATFORM_FEE_USD,
    totalUsd: GET_VAULTED_TRADE_PLATFORM_FEE_USD + shippingUsd,
    mock: result.quote.mock,
  });
}
