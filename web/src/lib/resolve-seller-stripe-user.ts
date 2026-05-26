import { NextResponse } from "next/server";
import { isAccountDeleted } from "@/lib/account-deletion";
import { getServerSessionSafe } from "@/lib/auth";
import { syncStripeConnectFromEmailSibling } from "@/lib/link-stripe-account-from-email-sibling";
import { requireUserIdFromSupabaseBearer } from "@/lib/require-supabase-bearer";
import { prisma } from "@/lib/prisma";

export function logStripeOnboarding(step: string, data: Record<string, unknown>): void {
  console.info(`[stripe onboarding] ${step}`, data);
}

/**
 * Resolves the Prisma user id for Stripe Connect flows (web session or mobile bearer).
 * Syncs Connect snapshot from an email sibling row when the session user lacks `stripeAccountId`.
 */
export async function resolveSellerStripeUserId(
  request: Request,
): Promise<{ userId: string; authSource: "bearer" | "session" } | NextResponse> {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const auth = await requireUserIdFromSupabaseBearer(request);
    if (auth instanceof NextResponse) return auth;
    logStripeOnboarding("auth_bearer", { userId: auth.userId });
    return { userId: auth.userId, authSource: "bearer" };
  }

  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  let syncedAccountId: string | null = null;
  try {
    syncedAccountId = await syncStripeConnectFromEmailSibling(userId);
  } catch (e) {
    console.warn("[resolveSellerStripeUserId] email sibling sync failed", {
      userId,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeAccountId: true, accountDeletedAt: true, suspendedAt: true },
  });
  if (!row) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  if (isAccountDeleted(row)) {
    return NextResponse.json({ error: "This account has been deleted." }, { status: 403 });
  }
  if (row.suspendedAt) {
    return NextResponse.json({ error: "This account is suspended." }, { status: 403 });
  }

  logStripeOnboarding("auth_session", {
    userId,
    existingStripeAccountId: row.stripeAccountId ?? syncedAccountId ?? null,
    siblingSyncAccountId: syncedAccountId,
  });

  return { userId, authSource: "session" };
}
