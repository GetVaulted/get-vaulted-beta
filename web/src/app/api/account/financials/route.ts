import { NextResponse } from "next/server";
import {
  buildBuyerFinancialsSummary,
  resolveFinancialsTimeZone,
} from "@/lib/buyer-financials";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";

export async function GET(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const timeZone = resolveFinancialsTimeZone(url.searchParams.get("tz"));

  try {
    const financials = await buildBuyerFinancialsSummary(auth.userId, timeZone);
    return NextResponse.json({ financials });
  } catch (e) {
    console.error("[api/account/financials]", e);
    return NextResponse.json({ error: "Could not load financials." }, { status: 500 });
  }
}
