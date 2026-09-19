import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { listAdminReplays } from "@/lib/trust/live-replay-service";

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const liveRoomId = url.searchParams.get("liveRoomId")?.trim() || undefined;
  const takeRaw = url.searchParams.get("take");
  const take = takeRaw ? Number.parseInt(takeRaw, 10) : 100;

  const replays = await listAdminReplays({
    liveRoomId,
    take: Number.isFinite(take) ? take : 100,
  });

  return NextResponse.json({ replays });
}
