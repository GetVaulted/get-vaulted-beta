import { createHash, randomBytes } from "crypto";
import { Prisma } from "@/generated/prisma/client";
import type { LiveItemSalesFormat, LiveItemVariantAssignmentMode } from "@/generated/prisma/client";
import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import { prisma } from "@/lib/prisma";
import { NFL_DIVISIONS_PRESET, NFL_TEAMS_PRESET } from "@/lib/live-item-variant-presets";
import { emitVaultRevealSpin } from "@/lib/realtime-emit-server";
import { formatDivisionReelAbbr, VAULT_REVEAL_DEFAULT_DURATION_MS } from "@/lib/vault-reveal-spin";

export type RandomPoolEntry = { label: string; abbr: string };

/**
 * Draw attempts before giving up and treating the pool as exhausted (see FIX 1/FIX 3).
 * FIX 6: bumped from 3 to 8 — under high concurrency near pool exhaustion, a handful of
 * consecutive P2002 unique-violation retries (just a re-read + re-attempt, cheap) can lose the
 * race every time even though unclaimed labels still exist. A false-positive "exhausted" here
 * triggers the refund/alert safety net for a purchase that could have succeeded, which is more
 * costly than a few extra retries — bias toward more retries being safer.
 */
const MAX_DRAW_ATTEMPTS = 8;

export function isRandomVariantAssignment(mode: LiveItemVariantAssignmentMode | string | null | undefined): boolean {
  return mode === "random";
}

export function randomPoolForSalesFormat(format: LiveItemSalesFormat): RandomPoolEntry[] {
  if (format === "team_break") {
    return NFL_DIVISIONS_PRESET.map((d) => ({
      label: d.label,
      abbr: formatDivisionReelAbbr(d.label),
    }));
  }
  return NFL_TEAMS_PRESET.map((t) => ({ label: t.label, abbr: t.abbr ?? t.label }));
}

function pickIndex(seed: string, max: number): number {
  if (max <= 0) return 0;
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 8);
  const n = Number.parseInt(hex, 16);
  return Number.isFinite(n) ? n % max : 0;
}

type Db = typeof prisma | TransactionClient;

async function assignedLabelsForItem(db: Db, liveRoomItemId: string): Promise<Set<string>> {
  const assigned = await db.liveItemVariantPurchase.findMany({
    where: {
      liveRoomItemId,
      paymentStatus: "paid",
      revealedLabel: { not: null },
    },
    select: { revealedLabel: true },
  });
  return new Set(assigned.map((r) => r.revealedLabel!.trim().toLowerCase()));
}

/**
 * Count of pool labels not yet claimed for this item. Shared by the purchase route (FIX 3 — reject
 * new purchases once the pool is fully claimed, independent of raw `quantityRemaining`) and the
 * draw logic below. Accepts an optional transaction client so the purchase route can check this as
 * part of the same reservation transaction.
 */
export async function remainingRandomPoolCount(args: {
  liveRoomItemId: string;
  salesFormat: LiveItemSalesFormat;
  db?: Db;
}): Promise<number> {
  const pool = randomPoolForSalesFormat(args.salesFormat);
  if (pool.length === 0) return 0;
  const taken = await assignedLabelsForItem(args.db ?? prisma, args.liveRoomItemId);
  return pool.filter((p) => !taken.has(p.label.trim().toLowerCase())).length;
}

function isUniqueConstraintError(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/**
 * Assign a random team/division on paid purchase and broadcast the Vault Reveal wheel.
 *
 * The read-filter-pick-write sequence below is NOT run inside a single serializable transaction:
 * two concurrent purchases could still both read the same "assigned" snapshot before either write
 * commits. Instead, the DB-level unique constraint on `(liveRoomItemId, revealedLabel)` is the real
 * concurrency control — one of the two concurrent writes for the same label will fail with a unique
 * violation (P2002), and that caller retries the draw against a freshly re-read "taken" set. This
 * converges quickly because each retry excludes at least one more label than the last attempt.
 */
export async function executeRandomVariantRevealOnPurchase(args: {
  purchaseId: string;
  liveRoomId: string;
  liveRoomItemId: string;
  buyerUsername: string;
  itemTitle: string;
  salesFormat: LiveItemSalesFormat;
}): Promise<{ label: string; abbr: string } | null> {
  const pool = randomPoolForSalesFormat(args.salesFormat);
  if (pool.length === 0) return null;

  for (let attempt = 0; attempt < MAX_DRAW_ATTEMPTS; attempt++) {
    const taken = await assignedLabelsForItem(prisma, args.liveRoomItemId);
    const remaining = pool.filter((p) => !taken.has(p.label.trim().toLowerCase()));
    if (remaining.length === 0) return null;

    const seed = `${args.purchaseId}:${attempt}:${randomBytes(8).toString("hex")}`;
    const winnerIndex = pickIndex(seed, remaining.length);
    const winner = remaining[winnerIndex]!;

    try {
      await prisma.liveItemVariantPurchase.update({
        where: { id: args.purchaseId },
        data: { revealedLabel: winner.label, revealedAbbr: winner.abbr },
      });
    } catch (e) {
      if (isUniqueConstraintError(e)) {
        // Another concurrent purchase claimed this exact label first — re-read the (now updated)
        // taken set and try again instead of failing the whole purchase.
        continue;
      }
      throw e;
    }

    const wheelLabels = remaining.map((r) => r.label);
    const spinId = `random-${args.purchaseId}`;

    emitVaultRevealSpin(args.liveRoomId, {
      spinId,
      kind: "random_reveal",
      title: args.itemTitle.trim() || "Random reveal",
      labels: wheelLabels,
      winnerIndex,
      winnerLabel: winner.label,
      durationMs: VAULT_REVEAL_DEFAULT_DURATION_MS,
      referenceId: args.purchaseId,
      segmentAbbrs: remaining.map((r) => r.abbr),
      buyerUsername: args.buyerUsername.replace(/^@+/, ""),
    });

    return winner;
  }

  // Exhausted all retries — every label this call attempted was won by a concurrent purchase, or
  // the pool is genuinely exhausted. The caller (FIX 3) must treat this exactly like exhaustion:
  // refund/alert rather than leaving the buyer charged with nothing.
  return null;
}
