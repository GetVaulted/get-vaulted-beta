import { NextResponse } from "next/server";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";
import { searchModeratorCandidates } from "@/lib/live-tip-moderator";

export async function GET(req: Request) {
  const auth = await resolveLiveRoomsUserId(req);
  if (auth instanceof NextResponse) return auth;

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ users: [] });
  }

  const users = await searchModeratorCandidates(q, auth.userId);
  return NextResponse.json({ users });
}
