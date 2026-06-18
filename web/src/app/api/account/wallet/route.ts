import { NextResponse } from "next/server";
import { buildBuyerWalletSummary } from "@/lib/buyer-wallet";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";

/** Consolidated Vault Wallet summary for mobile and web account hub. */
export async function GET(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  const wallet = await buildBuyerWalletSummary(auth.userId);
  return NextResponse.json({ wallet });
}
