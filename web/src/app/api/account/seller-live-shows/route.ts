import { NextResponse } from "next/server";
import { listSellerAccountLiveShows } from "@/lib/seller-account-live-shows";
import { resolveAccountSellerUserId } from "@/lib/resolve-account-seller-user";

export async function GET(req: Request) {
  const auth = await resolveAccountSellerUserId(req);
  if (auth instanceof NextResponse) return auth;

  const shows = await listSellerAccountLiveShows(auth.userId);
  return NextResponse.json({ shows });
}
