"use client";

import type { VaultRevealSpinPayload } from "@/lib/vault-reveal-spin";
import { VaultDropRevealOverlay } from "@/components/live-auction/VaultDropRevealOverlay";

/** Giveaways, PYT randomizer, and per-spot random reveals — Vault Drop hype reveal. */
export function VaultRevealOverlay({
  spin,
  onDismiss,
}: {
  spin: VaultRevealSpinPayload | null;
  onDismiss: () => void;
}) {
  return <VaultDropRevealOverlay spin={spin} onDismiss={onDismiss} />;
}
