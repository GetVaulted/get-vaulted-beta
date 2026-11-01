"use client";

import type { VaultRevealSpinPayload } from "@/lib/vault-reveal-spin";
import { VaultDropRevealOverlay } from "@/components/live-auction/VaultDropRevealOverlay";
import { SurpriseRevealCardOverlay } from "@/components/live-auction/SurpriseRevealCardOverlay";

/**
 * Giveaways, PYT randomizer, and per-spot random reveals — Vault Drop hype reveal.
 * Surprise Set draws get their own TikTok-style card instead.
 */
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
  if (spin?.surpriseCard) {
    return (
      <SurpriseRevealCardOverlay
        key={spin.spinId}
        spin={spin}
        card={spin.surpriseCard}
        onDismiss={onDismiss}
        viewerUsername={viewerUsername}
      />
    );
  }
  return (
    <VaultDropRevealOverlay
      spin={spin}
      onDismiss={onDismiss}
      viewerUsername={viewerUsername}
      viewerUserId={viewerUserId}
    />
  );
}
