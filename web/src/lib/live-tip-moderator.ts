import type { PrismaClient } from "@/generated/prisma/client";
import type { TipRecipientMode } from "@/generated/prisma/client";
import { parseLiveTipConfigFromBody } from "@/lib/live-tip-routing";
import { prisma } from "@/lib/prisma";

export type ModeratorValidationResult =
  | { ok: true; user: { id: string; username: string; stripeAccountId: string | null; stripeOnboardingComplete: boolean } }
  | { ok: false; error: string };

export async function validateLiveTipModeratorUserId(
  moderatorId: string,
  hostUserId: string,
  db: Pick<PrismaClient, "user"> = prisma,
): Promise<ModeratorValidationResult> {
  const id = moderatorId.trim();
  if (!id) return { ok: false, error: "Select a moderator." };
  if (id === hostUserId) return { ok: false, error: "Moderator must be a different user than the host." };

  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      suspendedAt: true,
      stripeAccountId: true,
      stripeOnboardingComplete: true,
    },
  });
  if (!user) return { ok: false, error: "Moderator account not found." };
  if (user.suspendedAt) return { ok: false, error: "That user cannot be assigned as a moderator." };

  return {
    ok: true,
    user: {
      id: user.id,
      username: user.username,
      stripeAccountId: user.stripeAccountId,
      stripeOnboardingComplete: user.stripeOnboardingComplete,
    },
  };
}

export async function buildLiveTipRoomData(
  hostUserId: string,
  body: {
    tipModeratorId?: unknown;
    tipRecipientMode?: unknown;
    tipsToModerator?: unknown;
  },
  db: Pick<PrismaClient, "user"> = prisma,
): Promise<
  | { ok: true; data: { tipModeratorId: string | null; tipRecipientMode: TipRecipientMode } }
  | { ok: false; error: string }
> {
  const parsed = parseLiveTipConfigFromBody(body);

  if (!parsed.tipModeratorId) {
    return { ok: true, data: { tipModeratorId: null, tipRecipientMode: "host" } };
  }

  const v = await validateLiveTipModeratorUserId(parsed.tipModeratorId, hostUserId, db);
  if (!v.ok) return { ok: false, error: v.error };

  if (parsed.tipRecipientMode === "moderator") {
    if (!v.user.stripeAccountId?.trim() || !v.user.stripeOnboardingComplete) {
      return {
        ok: false,
        error: "Moderator must finish payout setup before tips can be routed to them.",
      };
    }
  }

  return { ok: true, data: parsed };
}

export async function searchModeratorCandidates(
  query: string,
  hostUserId: string,
  db: Pick<PrismaClient, "user"> = prisma,
): Promise<{ id: string; username: string; email: string }[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  return db.user.findMany({
    where: {
      id: { not: hostUserId },
      suspendedAt: null,
      OR: [{ username: { contains: q } }, { email: { contains: q } }],
    },
    take: 15,
    select: { id: true, username: true, email: true },
    orderBy: { username: "asc" },
  });
}
