/**
 * Pure rules for the Sweet 16 draft that are easy to get wrong and worth testing in isolation
 * (no Prisma / network imports -- see live-sweet16-draft.ts for the DB-backed callers).
 */

/** A pending checkout older than this is treated as abandoned and no longer holds up the draft. */
export const SWEET16_PENDING_PAYMENT_MAX_AGE_MS = 10 * 60_000;

/**
 * One buyer can own several of the 16 slots, and every slot gets its own turn. Which of the
 * viewer's purchases counts as "theirs" therefore depends on whose turn it is: if they own the
 * purchase that is up now, that one; otherwise their first (stable) purchase.
 *
 * The previous implementation took an arbitrary purchase, so a buyer holding slots A and B could
 * be told "not your turn" on B's turn and have the server pick for them after the timeout.
 */
export function resolveViewerPurchaseId(
  ownedPurchaseIds: readonly string[],
  currentTurnPurchaseId: string | null,
): string | null {
  if (ownedPurchaseIds.length === 0) return null;
  if (currentTurnPurchaseId && ownedPurchaseIds.includes(currentTurnPurchaseId)) {
    return currentTurnPurchaseId;
  }
  return ownedPurchaseIds[0] ?? null;
}

export type SlotPaymentRow = {
  paymentStatus: string;
  createdAtMs: number;
};

/**
 * Slots that are reserved but not yet paid. The board reads "sold out" as soon as stock is
 * reserved, but the draft's turn order only contains paid purchases -- starting while a checkout
 * is still in flight would leave that buyer without a turn (and without a team) even if they pay
 * a moment later. Abandoned checkouts (older than the max age) are ignored so they can't block
 * the host forever.
 */
export function countBlockingPendingPayments(
  rows: readonly SlotPaymentRow[],
  nowMs: number,
  maxAgeMs: number = SWEET16_PENDING_PAYMENT_MAX_AGE_MS,
): number {
  return rows.filter((r) => r.paymentStatus === "pending_payment" && nowMs - r.createdAtMs < maxAgeMs).length;
}

/**
 * Sweet 16 Break format: the board lists all 32 teams, buyers buy a specific team, and sales stop
 * automatically once this many are sold. The draft then hands out the teams nobody bought, so
 * with 16 buyers every one of them ends up with two teams (the one they bought + one drafted).
 */
export const SWEET16_MAX_SPOTS = 16;

/** Items created before the 32-team board sold 16 blind "Slot N" spots. Kept working as-is. */
export function isLegacySweet16SlotBoard(variantLabels: readonly string[]): boolean {
  return variantLabels.length > 0 && variantLabels.every((l) => /^slot \d+$/i.test(l.trim()));
}

/** Label stored on a purchase once its draft pick lands: the team they bought + the one drafted. */
export function combineSweet16SpotLabel(boughtLabel: string | null | undefined, draftedLabel: string): string {
  const bought = boughtLabel?.trim();
  return bought ? `${bought} + ${draftedLabel}` : draftedLabel;
}

export function combineSweet16SpotAbbr(boughtAbbr: string | null | undefined, draftedAbbr: string): string {
  const bought = boughtAbbr?.trim();
  return bought ? `${bought} + ${draftedAbbr}` : draftedAbbr;
}

export type Sweet16BoardVariant = { label: string; abbr: string; sortOrder: number };
export type Sweet16BoardPurchase = {
  purchaseId: string;
  variantLabel: string;
  buyerUsername: string | null;
};
export type Sweet16BoardPick = { teamLabel: string; purchaseId: string; buyerUsername: string | null };

export type Sweet16BoardTile = {
  label: string;
  abbr: string;
  state: "open" | "purchased" | "drafted";
  buyerUsername: string | null;
  purchaseId: string | null;
};

/** One tile per team on the board: open, bought at checkout, or drafted. Board order is stable. */
export function buildSweet16Board(
  variants: readonly Sweet16BoardVariant[],
  purchases: readonly Sweet16BoardPurchase[],
  picks: readonly Sweet16BoardPick[],
): Sweet16BoardTile[] {
  const purchaseByLabel = new Map(purchases.map((p) => [p.variantLabel.trim().toLowerCase(), p]));
  const pickByLabel = new Map(picks.map((p) => [p.teamLabel.trim().toLowerCase(), p]));
  return [...variants]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
    .map((v) => {
      const key = v.label.trim().toLowerCase();
      const bought = purchaseByLabel.get(key);
      if (bought) {
        return {
          label: v.label,
          abbr: v.abbr,
          state: "purchased" as const,
          buyerUsername: bought.buyerUsername,
          purchaseId: bought.purchaseId,
        };
      }
      const drafted = pickByLabel.get(key);
      if (drafted) {
        return {
          label: v.label,
          abbr: v.abbr,
          state: "drafted" as const,
          buyerUsername: drafted.buyerUsername,
          purchaseId: drafted.purchaseId,
        };
      }
      return { label: v.label, abbr: v.abbr, state: "open" as const, buyerUsername: null, purchaseId: null };
    });
}

/** Teams still open for the draft: every board team no one bought (sorted like the board). */
export function sweet16DraftPoolLabels(
  variants: readonly Sweet16BoardVariant[],
  purchasedLabels: readonly string[],
): string[] {
  const bought = new Set(purchasedLabels.map((l) => l.trim().toLowerCase()));
  return [...variants]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
    .map((v) => v.label)
    .filter((l) => !bought.has(l.trim().toLowerCase()));
}

/**
 * Whether one more checkout may start. `reserved` counts paid purchases plus checkouts still in
 * flight (an abandoned one stops counting after SWEET16_PENDING_PAYMENT_MAX_AGE_MS), so two
 * buyers can't both grab the 16th spot and a failed card frees the spot again.
 */
export function sweet16HasRoomFor(reserved: number, additional: number, max: number = SWEET16_MAX_SPOTS): boolean {
  return reserved + Math.max(1, additional) <= max;
}
