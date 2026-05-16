import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { ensurePrismaUserForSupabaseAuth } from "@/lib/ensure-prisma-user-from-supabase-auth";

/**
 * Validates `Authorization: Bearer <supabase_access_token>` for mobile / native clients,
 * then resolves a Prisma `User.id` (creating a minimal `User` when the account exists only in Supabase).
 * NextAuth cookie sessions are not sent from React Native.
 */
export async function requireUserIdFromSupabaseBearer(
  request: Request,
): Promise<{ userId: string } | NextResponse> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const jwt = auth.slice("Bearer ".length).trim();
  if (!jwt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url?.trim() || !anonKey?.trim()) {
    return NextResponse.json({ error: "Server misconfigured (Supabase URL/key)." }, { status: 500 });
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data.user?.id) {
    return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
  }

  const prismaUserId = await ensurePrismaUserForSupabaseAuth(data.user);
  if (!prismaUserId) {
    return NextResponse.json(
      { error: "Add a verified email to your account before setting up payouts." },
      { status: 400 },
    );
  }

  return { userId: prismaUserId };
}
