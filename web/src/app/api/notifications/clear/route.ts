import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";

/** Wipe the signed-in user's notification inbox. */
export async function DELETE(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  const res = await prisma.notification.deleteMany({
    where: { userId: auth.userId },
  });

  return NextResponse.json({ ok: true, deleted: res.count });
}
