import { NextResponse } from "next/server";
import { isAccountDeleted } from "@/lib/account-deletion";
import { getCachedBearerAuth, getStaleBearerAuth, setCachedBearerAuth } from "@/lib/bearer-auth-cache";
import { ensurePrismaUserForSupabaseAuth } from "@/lib/ensure-prisma-user-from-supabase-auth";
import { syncStripeConnectFromEmailSibling } from "@/lib/link-stripe-account-from-email-sibling";
import { getSupabaseBearerJwt } from "@/lib/mobile-supabase-bearer";
import { prisma } from "@/lib/prisma";
import { syncPrismaEmailVerifiedFromSupabase } from "@/lib/sync-prisma-email-verified";
import { verifySupabaseAccessToken, verifyViaAuthServer } from "@/lib/verify-supabase-access-token";

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

  const cached = getCachedBearerAuth(jwt);
  if (cached) return cached;

  const verified = await verifySupabaseAccessToken(jwt);
  if (!verified.ok) {
    if (verified.reason === "unavailable") {
      // Sign-in service unreachable: keep people who were already verified working, and fail fast (not 401,
      // which would make the app think the session expired) for everyone else.
      const stale = getStaleBearerAuth(jwt);
      if (stale) return stale;
      console.warn("[requireUserIdFromSupabaseBearer] auth verification unavailable");
      return NextResponse.json(
        { error: "Sign-in check is busy. Please try again in a moment.", code: "AUTH_UNAVAILABLE" },
        { status: 503, headers: { "Retry-After": "3" } },
      );
    }
    return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
  }
  const supabaseUser = verified.user;

  let prismaUserId: string | null;
  try {
    prismaUserId = await ensurePrismaUserForSupabaseAuth(supabaseUser);
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
    select: { accountDeletedAt: true, suspendedAt: true, emailVerified: true },
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

  // Locally verified tokens do not say whether Supabase has confirmed the email. If our record is not marked
  // verified yet, ask Supabase once (time-limited, best effort) so the flag still gets synced.
  if (verified.source === "local" && accountRow && !accountRow.emailVerified) {
    const full = await verifyViaAuthServer(jwt);
    if (full.ok) {
      try {
        await syncPrismaEmailVerifiedFromSupabase(prismaUserId, full.user);
      } catch (e) {
        console.warn("[requireUserIdFromSupabaseBearer] email verified sync failed", {
          userId: prismaUserId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
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

  const resolved = { userId: prismaUserId, supabaseAuthUserId: supabaseUser.id };
  setCachedBearerAuth(jwt, resolved);
  return resolved;
}
