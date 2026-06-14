import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";

export async function PATCH(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveAccountUserId(_req);
  if (auth instanceof NextResponse) return auth;

  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);

  const res = await prisma.notification.updateMany({
    where: { id, userId: auth.userId, readAt: null },
    data: { readAt: new Date() },
  });

  if (res.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
