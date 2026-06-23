"use client";

import type { VaultRevealSpinPayload } from "@/lib/vault-reveal-spin";
import { VaultSealRevealOverlay } from "@/components/live-auction/VaultSealRevealOverlay";

/** Giveaways, PYT randomizer, and per-spot random reveals all use the Vault Seal. */
export function VaultRevealOverlay({
  spin,
  onDismiss,
}: {
  spin: VaultRevealSpinPayload | null;
  onDismiss: () => void;
}) {
  return <VaultSealRevealOverlay spin={spin} onDismiss={onDismiss} />;
}
