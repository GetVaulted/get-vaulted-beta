import { NextResponse } from "next/server";
import { getServerSessionSafe } from "@/lib/auth";
import { requireUserIdFromSupabaseBearer } from "@/lib/require-supabase-bearer";
import { resolveAccountSellerUserId } from "@/lib/resolve-account-seller-user";

/** Signed-in viewer id when present; null for guests or invalid Bearer (public room GET). */
export async function resolveOptionalLiveRoomsUserId(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const auth = await requireUserIdFromSupabaseBearer(request);
    return auth instanceof NextResponse ? null : auth.userId;
  }
  const session = await getServerSessionSafe();
  return session?.user?.id ?? null;
}

/**
 * Authenticated seller/user id for live-room mutations and `mine=1` lists.
 * Uses the same resolution as `/api/seller/live-readiness` (email rebind, account seller row).
 */
export async function resolveLiveRoomsUserId(
  request: Request,
): Promise<{ userId: string } | NextResponse> {
  const auth = await resolveAccountSellerUserId(request);
  if (auth instanceof NextResponse) return auth;
  return { userId: auth.userId };
}
