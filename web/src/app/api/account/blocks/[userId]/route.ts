import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { prisma } from "@/lib/prisma";
import { isUserBlockError, setUserBlocked } from "@/lib/user-block";

/** Unblock a user by id. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ userId: string }> }) {
  const auth = await resolveAccountUserId(_req);
  if (auth instanceof NextResponse) return auth;

  const { userId: raw } = await ctx.params;
  const userId = decodeURIComponent(raw).trim();
  if (!userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }

  try {
    await setUserBlocked(prisma, {
      blockerId: auth.userId,
      blockedId: userId,
      blocked: false,
    });
  } catch (e) {
    if (isUserBlockError(e)) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 403 });
    }
    throw e;
  }

  return NextResponse.json({ ok: true, userId, blocked: false });
}
