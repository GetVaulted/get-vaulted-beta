import { NextResponse } from "next/server";
import { getServerSessionSafe } from "@/lib/auth";
import { requireUserIdFromSupabaseBearer } from "@/lib/require-supabase-bearer";

/** Web session (cookies) or mobile `Authorization: Bearer` (Supabase JWT). */
export async function resolveListingsUserId(
  request: Request,
): Promise<{ userId: string } | NextResponse> {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return requireUserIdFromSupabaseBearer(request);
  }

  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return { userId: session.user.id };
}

/** Optional auth — returns userId when signed in, null for guests. */
export async function resolveOptionalListingsUserId(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const auth = await requireUserIdFromSupabaseBearer(request);
    return auth instanceof NextResponse ? null : auth.userId;
  }
  const session = await getServerSessionSafe();
  return session?.user?.id ?? null;
}
