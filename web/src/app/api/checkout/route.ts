import { postMarketplaceCheckout } from "@/app/api/checkout/checkout-post";

export const runtime = "nodejs";

/** Unified marketplace checkout entry (Stripe by default; optional alternate path when `ESCROW_ENABLED=true`). */
export async function POST(req: Request) {
  return postMarketplaceCheckout(req);
}
