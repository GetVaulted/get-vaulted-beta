import { postMarketplaceCheckout } from "@/app/api/checkout/checkout-post";

export const runtime = "nodejs";

/** @deprecated Prefer `POST /api/checkout` — kept for existing clients. */
export async function POST(req: Request) {
  return postMarketplaceCheckout(req);
}
