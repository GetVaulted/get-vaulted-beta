import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import {
  ADULT_CONFIRMATION_REQUIRED_MESSAGE,
  RANDOM_PURCHASE_WINDOW_MS,
  evaluateRandomPurchaseLimits,
} from "@/lib/random-purchase-compliance";

export type RandomPurchaseGuardError = Error & {
  code: "ADULT_CONFIRMATION_REQUIRED" | "RANDOM_PURCHASE_DAILY_CAP" | "RANDOM_PURCHASE_COOLING_OFF";
  retryAt?: Date;
};

function guardError(
  code: RandomPurchaseGuardError["code"],
  message: string,
  retryAt?: Date,
): RandomPurchaseGuardError {
  return Object.assign(new Error(message), { code, retryAt }) as RandomPurchaseGuardError;
}

/**
 * Enforce the 18+ confirmation and the per-buyer purchase limits for a chance-based purchase.
 * Call inside the purchase transaction, before the new purchase row is created.
 */
export async function assertRandomPurchaseAllowedInTx(
  tx: TransactionClient,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { adultConfirmedAt: true },
  });
  if (!user?.adultConfirmedAt) {
    throw guardError("ADULT_CONFIRMATION_REQUIRED", ADULT_CONFIRMATION_REQUIRED_MESSAGE);
  }

  // Paid purchases and checkouts still in flight both count; failed / expired ones do not.
  const recent = await tx.liveItemVariantPurchase.findMany({
    where: {
      buyerId: userId,
      createdAt: { gt: new Date(now.getTime() - RANDOM_PURCHASE_WINDOW_MS) },
      paymentStatus: { in: ["paid", "pending_payment"] },
    },
    select: { createdAt: true, liveRoomItemId: true },
  });
  const itemIds = [...new Set(recent.map((r) => r.liveRoomItemId))];
  const randomItems = itemIds.length
    ? await tx.liveRoomItem.findMany({
        where: { id: { in: itemIds }, variantAssignmentMode: "random" },
        select: { id: true },
      })
    : [];
  const randomItemIds = new Set(randomItems.map((i) => i.id));
  const randomTimes = recent.filter((r) => randomItemIds.has(r.liveRoomItemId)).map((r) => r.createdAt);
  const verdict = evaluateRandomPurchaseLimits(randomTimes, now);
  if (!verdict.allowed) {
    throw guardError(verdict.code, verdict.message, verdict.retryAt);
  }
}

/** Map a guard error to an API response body + status, or null if `e` is not a guard error. */
export function randomPurchaseGuardResponse(
  e: unknown,
): { status: number; body: { error: string; code: string; retryAt?: string } } | null {
  if (!e || typeof e !== "object" || !("code" in e)) return null;
  const code = String((e as { code: unknown }).code);
  const message = e instanceof Error ? e.message : "Purchase not allowed.";
  if (code === "ADULT_CONFIRMATION_REQUIRED") {
    return { status: 403, body: { error: message, code } };
  }
  if (code === "RANDOM_PURCHASE_DAILY_CAP" || code === "RANDOM_PURCHASE_COOLING_OFF") {
    const retryAt = (e as { retryAt?: Date }).retryAt;
    return {
      status: 429,
      body: { error: message, code, ...(retryAt ? { retryAt: retryAt.toISOString() } : {}) },
    };
  }
  return null;
}
