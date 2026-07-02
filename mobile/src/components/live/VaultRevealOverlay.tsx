import type { VaultRevealSpinPayload } from '../../lib/vaultRevealSpin';
import { VaultDropRevealOverlay } from './VaultDropRevealOverlay';

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
