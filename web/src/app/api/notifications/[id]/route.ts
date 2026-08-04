import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";

/** Delete one notification owned by the signed-in user. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const res = await prisma.notification.deleteMany({
    where: { id, userId: auth.userId },
  });

  if (res.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
