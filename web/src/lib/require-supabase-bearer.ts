import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAccountDeleted } from "@/lib/account-deletion";
import { ensurePrismaUserForSupabaseAuth } from "@/lib/ensure-prisma-user-from-supabase-auth";
import { syncStripeConnectFromEmailSibling } from "@/lib/link-stripe-account-from-email-sibling";
import { getSupabaseBearerJwt } from "@/lib/mobile-supabase-bearer";
import { prisma } from "@/lib/prisma";

export type RequireSupabaseBearerOptions = {
  /** Skip Stripe Connect sibling sync (background endpoints like push-token registration). */
  skipStripeSiblingSync?: boolean;
};

/**
 * Validates `Authorization: Bearer <supabase_access_token>` for mobile / native clients,
 * then resolves a Prisma `User.id` (creating a minimal `User` when the account exists only in Supabase).
 * NextAuth cookie sessions are not sent from React Native.
 */
export async function requireUserIdFromSupabaseBearer(
  request: Request,
  options: RequireSupabaseBearerOptions = {},
): Promise<{ userId: string; supabaseAuthUserId: string } | NextResponse> {
  const jwt = getSupabaseBearerJwt(request);
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

  let prismaUserId: string | null;
  try {
    prismaUserId = await ensurePrismaUserForSupabaseAuth(data.user);
  } catch (e) {
    console.error("[requireUserIdFromSupabaseBearer] ensurePrismaUser failed", e);
    return NextResponse.json(
      { error: "Could not resolve your seller profile. Try again or sign out and back in." },
      { status: 503 },
    );
  }
  if (!prismaUserId) {
    return NextResponse.json(
      { error: "Add a verified email to your account before setting up payouts." },
      { status: 400 },
    );
  }

  const accountRow = await prisma.user.findUnique({
    where: { id: prismaUserId },
    select: { accountDeletedAt: true, suspendedAt: true },
  });
  if (accountRow && isAccountDeleted(accountRow)) {
    console.warn("[requireUserIdFromSupabaseBearer] account deleted", { prismaUserId });
    return NextResponse.json(
      { error: "This account has been deleted.", code: "ACCOUNT_DELETED" },
      { status: 403 },
    );
  }
  if (accountRow?.suspendedAt) {
    console.warn("[requireUserIdFromSupabaseBearer] account suspended", { prismaUserId });
    return NextResponse.json(
      { error: "This account is suspended.", code: "ACCOUNT_SUSPENDED" },
      { status: 403 },
    );
  }

  if (!options.skipStripeSiblingSync) {
    try {
      await syncStripeConnectFromEmailSibling(prismaUserId);
    } catch (e) {
      console.warn("[requireUserIdFromSupabaseBearer] stripe sibling sync failed", {
        userId: prismaUserId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { userId: prismaUserId, supabaseAuthUserId: data.user.id };
}
