import { NextResponse } from "next/server";
import { isAccountDeleted } from "@/lib/account-deletion";
import { getServerSessionSafe } from "@/lib/auth";
import { requestHasSupabaseBearer } from "@/lib/mobile-supabase-bearer";
import { requireUserIdFromSupabaseBearer } from "@/lib/require-supabase-bearer";
import { prisma } from "@/lib/prisma";

/** Web session (cookies) or mobile `Authorization: Bearer` (Supabase JWT). */
export async function resolveAccountUserId(
  request: Request,
): Promise<{ userId: string } | NextResponse> {
  if (requestHasSupabaseBearer(request)) {
    return requireUserIdFromSupabaseBearer(request);
  }

  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const row = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { accountDeletedAt: true, suspendedAt: true },
  });
  if (row && isAccountDeleted(row)) {
    return NextResponse.json({ error: "This account has been deleted." }, { status: 403 });
  }
  if (row?.suspendedAt) {
    return NextResponse.json({ error: "This account is suspended." }, { status: 403 });
  }

  return { userId: session.user.id };
}
