import { createHash, randomBytes } from "crypto";
import type { LiveItemSalesFormat, LiveItemVariantAssignmentMode } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { NFL_DIVISIONS_PRESET, NFL_TEAMS_PRESET } from "@/lib/live-item-variant-presets";
import { emitVaultRevealSpin } from "@/lib/realtime-emit-server";
import { VAULT_REVEAL_DEFAULT_DURATION_MS } from "@/lib/vault-reveal-spin";

export type RandomPoolEntry = { label: string; abbr: string };

export function isRandomVariantAssignment(mode: LiveItemVariantAssignmentMode | string | null | undefined): boolean {
  return mode === "random";
}

export function randomPoolForSalesFormat(format: LiveItemSalesFormat): RandomPoolEntry[] {
  if (format === "team_break") {
    return NFL_DIVISIONS_PRESET.map((d) => ({ label: d.label, abbr: d.label }));
  }
  return NFL_TEAMS_PRESET.map((t) => ({ label: t.label, abbr: t.abbr ?? t.label }));
}

function pickIndex(seed: string, max: number): number {
  if (max <= 0) return 0;
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 8);
  const n = Number.parseInt(hex, 16);
  return Number.isFinite(n) ? n % max : 0;
}

/** Assign a random team/division on paid purchase and broadcast the Vault Reveal wheel. */
export async function executeRandomVariantRevealOnPurchase(args: {
  purchaseId: string;
  liveRoomId: string;
  liveRoomItemId: string;
  buyerUsername: string;
  itemTitle: string;
  salesFormat: LiveItemSalesFormat;
}): Promise<{ label: string; abbr: string } | null> {
  const pool = randomPoolForSalesFormat(args.salesFormat);
  const assigned = await prisma.liveItemVariantPurchase.findMany({
    where: {
      liveRoomItemId: args.liveRoomItemId,
      paymentStatus: "paid",
      revealedLabel: { not: null },
    },
    select: { revealedLabel: true },
  });
  const taken = new Set(assigned.map((r) => r.revealedLabel!.trim().toLowerCase()));
  const remaining = pool.filter((p) => !taken.has(p.label.trim().toLowerCase()));
  if (remaining.length === 0) return null;

  const seed = `${args.purchaseId}:${randomBytes(8).toString("hex")}`;
  const winnerIndex = pickIndex(seed, remaining.length);
  const winner = remaining[winnerIndex]!;

  await prisma.liveItemVariantPurchase.update({
    where: { id: args.purchaseId },
    data: { revealedLabel: winner.label, revealedAbbr: winner.abbr },
  });

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
