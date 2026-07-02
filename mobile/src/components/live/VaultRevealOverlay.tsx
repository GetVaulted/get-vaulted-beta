import type { VaultRevealSpinPayload } from '../../lib/vaultRevealSpin';
import { VaultDropRevealOverlay } from './VaultDropRevealOverlay';

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
