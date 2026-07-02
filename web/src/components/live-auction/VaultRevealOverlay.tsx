"use client";

import type { VaultRevealSpinPayload } from "@/lib/vault-reveal-spin";
import { VaultDropRevealOverlay } from "@/components/live-auction/VaultDropRevealOverlay";

/** Giveaways, PYT randomizer, and per-spot random reveals — Vault Drop hype reveal. */
export function VaultRevealOverlay({
  spin,
  onDismiss,
  viewerUsername,
  viewerUserId,
}: {
  spin: VaultRevealSpinPayload | null;
  onDismiss: () => void;
  viewerUsername?: string | null;
  viewerUserId?: string | null;
}) {
  return (
    <VaultDropRevealOverlay
      spin={spin}
      onDismiss={onDismiss}
      viewerUsername={viewerUsername}
      viewerUserId={viewerUserId}
    />
  );
}
