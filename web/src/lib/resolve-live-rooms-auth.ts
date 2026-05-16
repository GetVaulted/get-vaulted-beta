import { NextResponse } from "next/server";
import { getServerSessionSafe } from "@/lib/auth";
import { requireUserIdFromSupabaseBearer } from "@/lib/require-supabase-bearer";

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

/** Web session (cookies) or mobile `Authorization: Bearer` (Supabase JWT). */
export async function resolveLiveRoomsUserId(
  request: Request,
): Promise<{ userId: string } | NextResponse> {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return requireUserIdFromSupabaseBearer(request);
  }

  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to create a live room." }, { status: 401 });
  }
  return { userId: session.user.id };
}
