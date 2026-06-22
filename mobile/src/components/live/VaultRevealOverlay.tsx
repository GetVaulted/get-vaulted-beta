import type { VaultRevealSpinPayload } from '../../lib/vaultRevealSpin';
import { VaultRevealWheelOverlay } from './VaultRevealWheelOverlay';
import { VaultSealRevealOverlay } from './VaultSealRevealOverlay';

/** Routes giveaway draws to Vault Seal; break randomizers keep the wheel. */
export function VaultRevealOverlay({
  spin,
  onDismiss,
}: {
  spin: VaultRevealSpinPayload | null;
  onDismiss: () => void;
}) {
  if (spin?.kind === 'giveaway') {
    return <VaultSealRevealOverlay spin={spin} onDismiss={onDismiss} />;
  }
  return <VaultRevealWheelOverlay spin={spin} onDismiss={onDismiss} />;
}
