"use client";

import type { VaultRevealSpinPayload } from "@/lib/vault-reveal-spin";
import { VaultRevealWheelOverlay } from "@/components/live-auction/VaultRevealWheelOverlay";

/** Giveaways, PYT randomizer, and per-spot random reveals all use the premium wheel. */
export function VaultRevealOverlay({
  spin,
  onDismiss,
}: {
  spin: VaultRevealSpinPayload | null;
  onDismiss: () => void;
}) {
  return <VaultRevealWheelOverlay spin={spin} onDismiss={onDismiss} />;
}
