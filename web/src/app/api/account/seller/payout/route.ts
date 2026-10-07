import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/request-rate-limit";
import { resolveAccountSellerUserId } from "@/lib/resolve-account-seller-user";
import { getSellerSelfPayoutSummary, initiateSellerSelfPayout } from "@/lib/seller-self-payout";

export const runtime = "nodejs";

/** GET — what the seller's "Initiate Payout" button would send right now, and whether it is allowed. */
export async function GET(req: Request) {
  const resolved = await resolveAccountSellerUserId(req);
  if (resolved instanceof NextResponse) return resolved;

  const rl = checkRateLimit(`seller-payout-summary:${resolved.userId}`, { limit: 30, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Slow down a moment and try again." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  try {
    return NextResponse.json(await getSellerSelfPayoutSummary(resolved.userId));
  } catch (e) {
    console.error("[account/seller/payout GET]", e);
    return NextResponse.json({ error: "Could not load your payout. Try again shortly." }, { status: 500 });
  }
}

/** POST — send the seller's own ready earnings to their bank (same rules as the admin release, plus limits). */
export async function POST(req: Request) {
  const resolved = await resolveAccountSellerUserId(req);
  if (resolved instanceof NextResponse) return resolved;

  const rl = checkRateLimit(`seller-payout-initiate:${resolved.userId}`, { limit: 5, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Slow down a moment and try again." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  try {
    const result = await initiateSellerSelfPayout(resolved.userId);
    return NextResponse.json(result, { status: result.ok ? 200 : result.code === "failed" ? 502 : 409 });
  } catch (e) {
    console.error("[account/seller/payout POST]", e);
    return NextResponse.json(
      { ok: false, code: "failed", message: "We couldn't start your payout. Please try again in a few minutes." },
      { status: 500 },
    );
  }
}
