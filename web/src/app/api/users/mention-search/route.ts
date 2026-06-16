import { NextResponse } from "next/server";
import { searchMentionUsers } from "@/lib/mentions/search-mention-users";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";

export async function GET(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) {
    return NextResponse.json({ users: [] });
  }

  const users = await searchMentionUsers(q, auth.userId);
  return NextResponse.json({ users });
}
