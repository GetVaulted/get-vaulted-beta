import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";

export async function PATCH(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  const now = new Date();
  await prisma.notification.updateMany({
    where: { userId: auth.userId, readAt: null },
    data: { readAt: now },
  });

  return NextResponse.json({ ok: true });
}
