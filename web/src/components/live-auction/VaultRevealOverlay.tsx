"use client";

import type { VaultRevealSpinPayload } from "@/lib/vault-reveal-spin";
import { VaultSealRevealOverlay } from "@/components/live-auction/VaultSealRevealOverlay";
import { VaultRevealWheelOverlay } from "@/components/live-auction/VaultRevealWheelOverlay";

/** Routes giveaway draws to Vault Seal; break randomizers keep the wheel. */
export function VaultRevealOverlay({
  spin,
  onDismiss,
}: {
  spin: VaultRevealSpinPayload | null;
  onDismiss: () => void;
}) {
  if (spin?.kind === "giveaway") {
    return <VaultSealRevealOverlay spin={spin} onDismiss={onDismiss} />;
  }
  return <VaultRevealWheelOverlay spin={spin} onDismiss={onDismiss} />;
}
