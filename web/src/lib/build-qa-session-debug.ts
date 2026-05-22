import { getServerSessionSafe } from "@/lib/auth";
import { prismaSellerVisibleOnPublicMarketplace } from "@/lib/demo-seed-sellers";
import { pickPrismaUserIdForSupabaseSession } from "@/lib/pick-prisma-user-for-supabase-auth";
import { prisma } from "@/lib/prisma";
import { supabaseProjectRefFromUrl } from "@/lib/resolve-database-url";
import {
  connectStatusFromUserRow,
  parseRequirementsDue,
  sellerCanSellFromConnectSnapshot,
} from "@/lib/stripe-connect-status-response";
import { onboardingUiStatusFromPartial } from "@/lib/stripe-connect-account-map";
import { loadUserForStripeConnectStatus } from "@/lib/load-user-stripe-connect-status";
import { syncStripeConnectFromEmailSibling } from "@/lib/link-stripe-account-from-email-sibling";
import { isStripeConfigured } from "@/lib/stripe";
import { requireUserIdFromSupabaseBearer } from "@/lib/require-supabase-bearer";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export type QaSessionDebugPayload = {
  generatedAt: string;
  environment: {
    nodeEnv: string;
    supabaseProjectRef: string | null;
    databaseProjectRef: string | null;
    expectedBetaProjectRef: string;
    alignedWithBeta: boolean;
    requestHost: string | null;
  };
  session: {
    authenticated: boolean;
    supabaseAuthUserId: string | null;
    email: string | null;
    prismaUserId: string | null;
    sessionSource: "bearer" | "cookie" | null;
  };
  identityConsistency: {
    prismaUsersWithSameEmail: Array<{
      id: string;
      stripeAccountId: string | null;
      stripeOnboardingComplete: boolean;
    }>;
    canonicalPrismaUserId: string | null;
    idEmailMismatch: boolean;
    warning: string | null;
  };
  sellerReadiness: {
    stripeAccountId: string | null;
    stripeOnboardingComplete: boolean;
    canPublish: boolean;
    canHostLive: boolean;
    payoutsReady: boolean;
    onboardingUiStatus: string | null;
    summary: string;
  } | null;
  liveDiscovery: {
    publicRoomCount: number;
    sellerRoomCount: number | null;
    rooms: Array<{
      id: string;
      title: string;
      status: string;
      roomType: string;
      sellerUsername: string | null;
    }>;
    source: "prisma";
  };
};

async function resolveActor(request: Request): Promise<
  | {
      supabaseAuthUserId: string | null;
      email: string | null;
      prismaUserId: string | null;
      sessionSource: "bearer" | "cookie" | null;
    }
  | NextResponse
> {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const auth = await requireUserIdFromSupabaseBearer(request);
    if (auth instanceof NextResponse) {
      return {
        supabaseAuthUserId: null,
        email: null,
        prismaUserId: null,
        sessionSource: null,
      };
    }
    const jwt = authHeader.slice("Bearer ".length).trim();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
    let supabaseAuthUserId: string | null = null;
    let email: string | null = null;
    if (url && anonKey) {
      const sb = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data } = await sb.auth.getUser(jwt);
      supabaseAuthUserId = data.user?.id ?? null;
      email = data.user?.email?.trim().toLowerCase() ?? null;
    }
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { email: true },
    });
    return {
      supabaseAuthUserId,
      email: email ?? user?.email?.trim().toLowerCase() ?? null,
      prismaUserId: auth.userId,
      sessionSource: "bearer",
    };
  }

  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return {
      supabaseAuthUserId: null,
      email: null,
      prismaUserId: null,
      sessionSource: null,
    };
  }
  return {
    supabaseAuthUserId: null,
    email: session.user.email?.trim().toLowerCase() ?? null,
    prismaUserId: session.user.id,
    sessionSource: "cookie",
  };
}

export async function buildQaSessionDebugPayload(request: Request): Promise<QaSessionDebugPayload | NextResponse> {
  const actor = await resolveActor(request);
  if (actor instanceof NextResponse) return actor;

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? process.env.SUPABASE_URL?.trim() ?? "";
  const dbUrl = process.env.DATABASE_URL?.trim() ?? process.env.INTEGRATION_DATABASE_URL?.trim() ?? "";
  const supabaseProjectRef = supabaseUrl ? supabaseProjectRefFromUrl(supabaseUrl) : null;
  const databaseProjectRef = dbUrl ? supabaseProjectRefFromUrl(dbUrl) : null;
  const expectedBetaProjectRef = "xkaaicokjgmpbctfermj";

  let prismaUsersWithSameEmail: QaSessionDebugPayload["identityConsistency"]["prismaUsersWithSameEmail"] = [];
  let canonicalPrismaUserId: string | null = actor.prismaUserId;
  let idEmailMismatch = false;
  let warning: string | null = null;

  if (actor.email) {
    prismaUsersWithSameEmail = await prisma.user.findMany({
      where: { email: actor.email },
      select: {
        id: true,
        stripeAccountId: true,
        stripeOnboardingComplete: true,
      },
      orderBy: { createdAt: "asc" },
    });
    if (prismaUsersWithSameEmail.length > 1) {
      warning = `${prismaUsersWithSameEmail.length} Prisma User rows share email ${actor.email}. APIs pick canonical id via stripe snapshot score.`;
    }
    if (actor.supabaseAuthUserId) {
      const byId = prismaUsersWithSameEmail.find((u) => u.id === actor.supabaseAuthUserId) ?? null;
      const byEmail =
        prismaUsersWithSameEmail.length === 1
          ? prismaUsersWithSameEmail[0]!
          : (prismaUsersWithSameEmail.find((u) => u.id !== actor.supabaseAuthUserId) ??
            prismaUsersWithSameEmail[0] ??
            null);
      const picked = pickPrismaUserIdForSupabaseSession({
        supabaseUserId: actor.supabaseAuthUserId,
        byId: byId
          ? {
              id: byId.id,
              stripeAccountId: byId.stripeAccountId,
              stripeOnboardingComplete: byId.stripeOnboardingComplete,
              stripeChargesEnabled: null,
              stripePayoutsEnabled: null,
            }
          : null,
        byEmail: byEmail
          ? {
              id: byEmail.id,
              stripeAccountId: byEmail.stripeAccountId,
              stripeOnboardingComplete: byEmail.stripeOnboardingComplete,
              stripeChargesEnabled: null,
              stripePayoutsEnabled: null,
            }
          : null,
      });
      if (picked) canonicalPrismaUserId = picked;
      idEmailMismatch = Boolean(byId && byEmail && byId.id !== byEmail.id);
      if (idEmailMismatch && actor.prismaUserId && actor.prismaUserId !== canonicalPrismaUserId) {
        warning = `Session resolved prisma id ${actor.prismaUserId} but canonical pick is ${canonicalPrismaUserId}. Sign out on all devices and use Clear QA Session.`;
      }
    }
  }

  let sellerReadiness: QaSessionDebugPayload["sellerReadiness"] = null;
  const readinessUserId = canonicalPrismaUserId ?? actor.prismaUserId;
  if (readinessUserId) {
    try {
      await syncStripeConnectFromEmailSibling(readinessUserId);
    } catch {
      /* non-fatal for debug */
    }
    const user = await loadUserForStripeConnectStatus(readinessUserId);
    if (user) {
      const snap = connectStatusFromUserRow(user, isStripeConfigured());
      const onboardingUiStatus = onboardingUiStatusFromPartial({
        hasAccountId: Boolean(user.stripeAccountId?.trim()),
        stripeOnboardingComplete: Boolean(user.stripeOnboardingComplete),
        stripeChargesEnabled: user.stripeChargesEnabled ?? null,
        stripePayoutsEnabled: user.stripePayoutsEnabled ?? null,
        requirementsDue: parseRequirementsDue(user.stripeRequirementsDue),
      });
      const canSell = sellerCanSellFromConnectSnapshot({
        stripeAccountId: user.stripeAccountId,
        stripeOnboardingComplete: Boolean(user.stripeOnboardingComplete),
        stripeChargesEnabled: user.stripeChargesEnabled ?? null,
        stripePayoutsEnabled: user.stripePayoutsEnabled ?? null,
        onboardingUiStatus,
      });
      sellerReadiness = {
        stripeAccountId: user.stripeAccountId ?? null,
        stripeOnboardingComplete: Boolean(user.stripeOnboardingComplete),
        canPublish: Boolean(snap.can_publish_active_listings),
        canHostLive: Boolean(snap.can_host_live_sales),
        payoutsReady: Boolean(snap.payouts_ready),
        onboardingUiStatus,
        summary: canSell
          ? "Ready — Connect snapshot allows publish + live."
          : user.stripeAccountId
            ? "Incomplete — stripeAccountId present but onboarding/charges/payouts not complete."
            : "Needs setup — no stripeAccountId on canonical user.",
      };
    }
  }

  const publicRows = await prisma.liveRoom.findMany({
    where: {
      status: { in: ["live", "scheduled"] },
      seller: prismaSellerVisibleOnPublicMarketplace(),
    },
    include: { seller: { select: { username: true } } },
    orderBy: { updatedAt: "desc" },
    take: 40,
  });

  let sellerRoomCount: number | null = null;
  if (readinessUserId) {
    sellerRoomCount = await prisma.liveRoom.count({
      where: {
        sellerId: readinessUserId,
        status: { in: ["live", "scheduled"] },
      },
    });
  }

  const host = request.headers.get("host");

  return {
    generatedAt: new Date().toISOString(),
    environment: {
      nodeEnv: process.env.NODE_ENV ?? "unknown",
      supabaseProjectRef,
      databaseProjectRef,
      expectedBetaProjectRef,
      alignedWithBeta: supabaseProjectRef === expectedBetaProjectRef,
      requestHost: host,
    },
    session: {
      authenticated: Boolean(actor.prismaUserId || actor.email),
      supabaseAuthUserId: actor.supabaseAuthUserId,
      email: actor.email,
      prismaUserId: actor.prismaUserId,
      sessionSource: actor.sessionSource,
    },
    identityConsistency: {
      prismaUsersWithSameEmail,
      canonicalPrismaUserId,
      idEmailMismatch,
      warning,
    },
    sellerReadiness,
    liveDiscovery: {
      publicRoomCount: publicRows.length,
      sellerRoomCount,
      rooms: publicRows.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        roomType: r.roomType,
        sellerUsername: r.seller.username,
      })),
      source: "prisma",
    },
  };
}
