/** Shared Vault Reveal wheel payload — must match web `vault-reveal-spin.ts`. */

export type VaultRevealSpinKind = 'giveaway' | 'break_pyt' | 'random_reveal';

export type VaultRevealSpinPayload = {
  spinId: string;
  kind: VaultRevealSpinKind;
  title: string;
  labels: string[];
  winnerIndex: number;
  winnerLabel: string;
  durationMs: number;
  referenceId?: string;
  assignments?: { order: number; label: string }[];
  segmentAbbrs?: string[];
  buyerUsername?: string;
};

export const VAULT_REVEAL_DEFAULT_DURATION_MS = 2400;
export const VAULT_REVEAL_RESULT_HOLD_MS = 1600;
export const VAULT_REVEAL_TOTAL_DISPLAY_MS =
  VAULT_REVEAL_DEFAULT_DURATION_MS + VAULT_REVEAL_RESULT_HOLD_MS;

export const VAULT_SEAL_GLOW_MS = 400;
export const VAULT_SEAL_BREAK_MS = 600;
export const VAULT_SEAL_WINNER_HOLD_MS = 1600;
export const VAULT_SEAL_TOTAL_MS = VAULT_SEAL_GLOW_MS + VAULT_SEAL_BREAK_MS + VAULT_SEAL_WINNER_HOLD_MS;

export function landingRotationDeg(winnerIndex: number, total: number, extraSpins = 5): number {
  if (total <= 0) return 0;
  const idx = Math.max(0, Math.min(winnerIndex, total - 1));
  const segment = 360 / total;
  const center = idx * segment + segment / 2;
  return extraSpins * 360 + (360 - center);
}

export function parseVaultRevealSpinPayload(raw: unknown): VaultRevealSpinPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const spin = (o.spin ?? o) as Record<string, unknown>;
  const labels = Array.isArray(spin.labels)
    ? spin.labels.filter((l): l is string => typeof l === 'string' && l.trim().length > 0)
    : [];
  if (labels.length === 0) return null;
  const winnerIndex = typeof spin.winnerIndex === 'number' ? spin.winnerIndex : 0;
  const spinId =
    typeof spin.spinId === 'string' ? spin.spinId : typeof o.eventId === 'string' ? o.eventId : '';
  if (!spinId) return null;
  const kind =
    spin.kind === 'break_pyt' ? 'break_pyt' : spin.kind === 'random_reveal' ? 'random_reveal' : 'giveaway';
  return {
    spinId,
    kind,
    title:
      typeof spin.title === 'string'
        ? spin.title
        : kind === 'random_reveal'
          ? 'Random reveal'
          : kind === 'break_pyt'
            ? 'PYT randomizer'
            : 'Giveaway',
    labels,
    winnerIndex: Math.max(0, Math.min(winnerIndex, labels.length - 1)),
    winnerLabel: typeof spin.winnerLabel === 'string' ? spin.winnerLabel : labels[winnerIndex] ?? '',
    durationMs:
      typeof spin.durationMs === 'number' && spin.durationMs > 0
        ? spin.durationMs
        : VAULT_REVEAL_DEFAULT_DURATION_MS,
    referenceId: typeof spin.referenceId === 'string' ? spin.referenceId : undefined,
    segmentAbbrs: Array.isArray(spin.segmentAbbrs)
      ? spin.segmentAbbrs.filter((a): a is string => typeof a === 'string')
      : undefined,
    buyerUsername: typeof spin.buyerUsername === 'string' ? spin.buyerUsername : undefined,
    assignments: Array.isArray(spin.assignments)
      ? spin.assignments
          .filter((a): a is { order: number; label: string } => {
            return (
              !!a &&
              typeof a === 'object' &&
              typeof (a as { order?: unknown }).order === 'number' &&
              typeof (a as { label?: unknown }).label === 'string'
            );
          })
          .map((a) => ({ order: a.order, label: a.label }))
      : undefined,
  };
}
