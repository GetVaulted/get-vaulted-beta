import { NextResponse } from "next/server";
import { getServerSessionSafe } from "@/lib/auth";
import { listBuyerWins } from "@/lib/trust/win-clip-service";

export const dynamic = "force-dynamic";

/** Buyer's recent live wins that can have a "Watch your win" video receipt. */
export async function GET() {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const wins = await listBuyerWins(session.user.id);
  return NextResponse.json({ wins });
}
