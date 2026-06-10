import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Canonical Prisma user id for mobile realtime subscriptions (may differ from Supabase auth id). */
export async function GET(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ userId: auth.userId });
}
