import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { serializeSupportTicket } from "@/lib/support-tickets";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);

  const row = await prisma.supportTicket.findFirst({
    where: { id, userId: auth.userId },
    include: {
      user: { select: { username: true } },
      assignedAdmin: { select: { username: true } },
    },
  });

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ticket: serializeSupportTicket(row) });
}
