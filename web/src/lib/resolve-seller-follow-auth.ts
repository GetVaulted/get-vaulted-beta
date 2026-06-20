import { NextResponse } from "next/server";
import { getServerSessionSafe } from "@/lib/auth";
import { requestHasSupabaseBearer } from "@/lib/mobile-supabase-bearer";
import { requireUserIdFromSupabaseBearer } from "@/lib/require-supabase-bearer";

/** Signed-in viewer for seller follow routes (web session or mobile Bearer). */
export async function resolveOptionalSellerFollowUserId(request: Request): Promise<string | null> {
  if (requestHasSupabaseBearer(request)) {
    const auth = await requireUserIdFromSupabaseBearer(request);
    return auth instanceof NextResponse ? null : auth.userId;
  }
  const session = await getServerSessionSafe();
  return session?.user?.id ?? null;
}

export async function requireSellerFollowUserId(
  request: Request,
): Promise<{ userId: string } | NextResponse> {
  if (requestHasSupabaseBearer(request)) {
    return requireUserIdFromSupabaseBearer(request);
  }
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return { userId: session.user.id };
}
