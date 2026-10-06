import { NextResponse } from "next/server";
import { searchPeopleUsers } from "@/lib/people-search";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";

/**
 * People directory search for follow discovery.
 * Auth preferred (follow status + block filtering); anonymous still gets username hits.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) {
    return NextResponse.json({ users: [] });
  }

  let viewerUserId: string | null = null;
  const auth = await resolveAccountUserId(req);
  if (!(auth instanceof NextResponse)) {
    viewerUserId = auth.userId;
  }

  const users = await searchPeopleUsers(q, viewerUserId);
  return NextResponse.json({ users });
}
