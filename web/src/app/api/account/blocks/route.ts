import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { prisma } from "@/lib/prisma";
import {
  isUserBlockError,
  listBlockedUsersForAccount,
  setUserBlocked,
} from "@/lib/user-block";

/** List users the signed-in account has blocked. */
export async function GET(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  const blocked = await listBlockedUsersForAccount(prisma, auth.userId);
  return NextResponse.json({ blocked });
}

type Body = { userId?: unknown; blocked?: unknown };

/** Block or unblock a user (body: `{ userId, blocked?: boolean }`). */
export async function POST(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }

  const blocked = body.blocked !== false;

  try {
    await setUserBlocked(prisma, {
      blockerId: auth.userId,
      blockedId: userId,
      blocked,
    });
  } catch (e) {
    if (isUserBlockError(e)) {
      const status = e.code === "USER_NOT_FOUND" ? 404 : 403;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    throw e;
  }

  return NextResponse.json({ ok: true, userId, blocked });
}
