import { NextResponse } from "next/server";
import { getServerSessionSafe } from "@/lib/auth";
import { requireUserIdFromSupabaseBearer } from "@/lib/require-supabase-bearer";

/** Web session (cookies) or mobile `Authorization: Bearer` (Supabase JWT). */
export async function resolveAccountUserId(
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
