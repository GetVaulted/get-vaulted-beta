import { NextResponse } from "next/server";
import { resolveAccountSellerUserId } from "@/lib/resolve-account-seller-user";
import {
  buildSellerFinancialsSummary,
  resolveSellerFinancialsTimeZone,
} from "@/lib/seller-financials";

export async function GET(req: Request) {
  const auth = await resolveAccountSellerUserId(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const timeZone = resolveSellerFinancialsTimeZone(url.searchParams.get("tz"));

  try {
    const financials = await buildSellerFinancialsSummary(auth.userId, timeZone);
    return NextResponse.json({ financials });
  } catch (e) {
    console.error("[api/account/seller-financials]", e);
    return NextResponse.json({ error: "Could not load seller financials." }, { status: 500 });
  }
}
