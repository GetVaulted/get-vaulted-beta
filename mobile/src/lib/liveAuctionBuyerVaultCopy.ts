/** Branded buyer waiting copy — auction / live-sale rooms only (not break). */

export const VAULT_WAITING_COPY = {
  vault_loading: 'The vault is being loaded.',
  lot_almost_ready: 'Next item is almost ready.',
  stay_locked_in: 'Stay locked in — the host is setting the next lot.',
  controls_when_live: 'Auction controls will appear when the lot goes live.',
} as const;

export type VaultWaitingKey = keyof typeof VAULT_WAITING_COPY;

const WAITING_ROTATION: VaultWaitingKey[] = [
  'vault_loading',
  'lot_almost_ready',
  'stay_locked_in',
  'controls_when_live',
];

/** Stable line per room + phase so copy does not flicker on poll. */
export function pickVaultWaitingMessage(roomId: string, phase: VaultWaitingKey | 'rotate'): string {
  if (phase !== 'rotate') return VAULT_WAITING_COPY[phase];
  let h = 0;
  for (let i = 0; i < roomId.length; i++) h = (h * 31 + roomId.charCodeAt(i)) >>> 0;
  return VAULT_WAITING_COPY[WAITING_ROTATION[h % WAITING_ROTATION.length]!];
}
