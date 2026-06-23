import type { VaultRevealSpinPayload } from '../../lib/vaultRevealSpin';
import { VaultRevealWheelOverlay } from './VaultRevealWheelOverlay';

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
