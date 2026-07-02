/** Shared Vault Reveal wheel payload — must match web `vault-reveal-spin.ts`. */

import {
  buildVaultDropPoolRun,
  buildVaultDropReelScrollPlan,
  vaultDropPoolRunAnimationMs,
  type VaultDropPoolRunStep,
} from '../../../shared/vault-drop-pool-run';

export type VaultRevealSpinKind = 'giveaway' | 'break_pyt' | 'random_reveal';
export type VaultRevealGiveawayKind = 'open' | 'buyers';

export type VaultRevealSpinPayload = {
  spinId: string;
  kind: VaultRevealSpinKind;
  title: string;
  labels: string[];
  winnerIndex: number;
  winnerLabel: string;
  durationMs: number;
  referenceId?: string;
  giveawayKind?: VaultRevealGiveawayKind;
  winnerUserId?: string;
  assignments?: { order: number; label: string }[];
  segmentAbbrs?: string[];
  buyerUsername?: string;
};

export const GIVVY_REVEAL_ACCENT = '#6ee7b7';
export const GIVVY_REVEAL_CHIP_COLORS = ['#6ee7b7', '#34d399', '#2dd4bf', '#5eead4'] as const;
export const GIVVY_REVEAL_BORDER_GRADIENT = ['#059669', '#34d399', '#6ee7b7'] as const;

export const VAULT_REVEAL_DEFAULT_DURATION_MS = 2400;
export const VAULT_REVEAL_RESULT_HOLD_MS = 1600;
export const VAULT_REVEAL_TOTAL_DISPLAY_MS =
  VAULT_REVEAL_DEFAULT_DURATION_MS + VAULT_REVEAL_RESULT_HOLD_MS;

export const VAULT_SEAL_GLOW_MS = 400;
export const VAULT_SEAL_BREAK_MS = 600;
export const VAULT_SEAL_WINNER_HOLD_MS = 1600;
export const VAULT_SEAL_TOTAL_MS = VAULT_SEAL_GLOW_MS + VAULT_SEAL_BREAK_MS + VAULT_SEAL_WINNER_HOLD_MS;

/** Vault Drop reveal — visible pool roll, flash slam, winner hold. */
export const VAULT_DROP_FLASH_MS = 100;
export const VAULT_DROP_HOLD_MS = 1400;
/** @deprecated Use vaultDropRevealTiming() — pool roll duration depends on label count. */
export const VAULT_DROP_BUILD_MS = 540;
export const VAULT_DROP_TOTAL_MS = VAULT_DROP_BUILD_MS + VAULT_DROP_FLASH_MS + VAULT_DROP_HOLD_MS;

export {
  buildVaultDropPoolRun,
  buildVaultDropReelLane,
  buildVaultDropReelScrollPlan,
  reelStepAnimationMs,
  reelStepEasingCss,
  vaultDropPoolChipActive,
  vaultDropPoolPhaseCopy,
  vaultDropPoolRollingLabel,
  vaultDropPoolRunAnimationMs,
  vaultDropPoolRunDurationMs,
  vaultDropReelLaneStartScrollIndex,
  vaultDropReelLandEasingCss,
  vaultDropReelSpinEasingCss,
  VAULT_DROP_REEL_LAND_MS,
  VAULT_DROP_REEL_LANE_COPIES,
  VAULT_DROP_REEL_PILL_GAP,
  VAULT_DROP_REEL_PILL_HEIGHT,
  VAULT_DROP_REEL_PILL_BORDER,
  VAULT_DROP_REEL_FOCUS_RING_PAD,
  VAULT_DROP_REEL_PILL_SPAN,
  VAULT_DROP_REEL_PILL_WIDTH,
  VAULT_DROP_REEL_SPIN_EXTRA_MS,
  vaultDropReelCenterOffset,
  vaultDropReelFocusRingPosition,
  type VaultDropPoolRunStep,
  type VaultDropReelScrollPlan,
} from '../../../shared/vault-drop-pool-run';

export function vaultDropRevealTiming(spin: Pick<VaultRevealSpinPayload, 'labels' | 'winnerIndex'>): {
  steps: VaultDropPoolRunStep[];
  poolMs: number;
  totalMs: number;
  scrollPlan: ReturnType<typeof buildVaultDropReelScrollPlan>;
} {
  const scrollPlan = buildVaultDropReelScrollPlan(spin.labels, spin.winnerIndex);
  return {
    steps: scrollPlan.steps,
    poolMs: scrollPlan.totalAnimationMs,
    totalMs: scrollPlan.totalAnimationMs + VAULT_DROP_HOLD_MS,
    scrollPlan,
  };
}

export function vaultDropRevealEyebrow(
  spin: Pick<VaultRevealSpinPayload, 'kind' | 'giveawayKind'>,
): string {
  if (spin.kind === 'giveaway') {
    return spin.giveawayKind === 'buyers' ? 'Buyers Givvy Draw' : 'Givvy Draw';
  }
  if (spin.kind === 'random_reveal') return 'Vault Drop';
  return 'Break Randomizer';
}

export function vaultDropPoolPhaseCopyForSpin(
  spin: Pick<VaultRevealSpinPayload, 'kind' | 'giveawayKind'>,
  progress: number,
): string {
  if (spin.kind === 'giveaway') {
    if (progress < 0.72) return 'Rolling entries';
    if (progress < 0.94) return 'Slowing down';
    return 'Locked';
  }
  if (progress < 0.72) return 'Rolling the pool';
  if (progress < 0.94) return 'Slowing down';
  return 'Locked';
}

export function vaultDropRevealPoolHint(spin: VaultRevealSpinPayload): string {
  if (spin.kind === 'giveaway') {
    return spin.giveawayKind === 'buyers'
      ? 'Buyer entry reel slows down and locks on the winner'
      : 'Entry reel slows down and locks on the winner';
  }
  if (spin.kind === 'random_reveal') {
    return 'Team reel slows down and locks on your draw';
  }
  return 'Spot reel slows down and locks on the draw';
}

export function vaultDropRevealAccent(spin: VaultRevealSpinPayload): string {
  if (spin.kind === 'giveaway') return GIVVY_REVEAL_ACCENT;
  return '#D4AF37';
}

export function vaultDropRevealChipColor(spin: VaultRevealSpinPayload, index: number): string {
  if (spin.kind === 'giveaway') {
    return GIVVY_REVEAL_CHIP_COLORS[index % GIVVY_REVEAL_CHIP_COLORS.length] ?? GIVVY_REVEAL_ACCENT;
  }
  return '#D4AF37';
}

export function vaultRevealDisplayMs(
  spin: Pick<VaultRevealSpinPayload, 'labels' | 'winnerIndex'>,
): number {
  return vaultDropRevealTiming(spin).totalMs;
}

export type VaultDropRevealViewer = {
  userId?: string | null;
  username?: string | null;
};

export function normalizeRevealUsername(raw: string | null | undefined): string {
  return raw?.trim().replace(/^@/, '').toLowerCase() ?? '';
}

export function vaultDropRevealViewerWonGiveaway(
  spin: VaultRevealSpinPayload,
  viewer?: VaultDropRevealViewer | null,
): boolean {
  if (spin.kind !== 'giveaway' || !viewer) return false;
  if (viewer.userId?.trim() && spin.winnerUserId?.trim() && viewer.userId === spin.winnerUserId) {
    return true;
  }
  const viewerHandle = normalizeRevealUsername(viewer.username);
  const winnerHandle = normalizeRevealUsername(spin.winnerLabel);
  return Boolean(viewerHandle && winnerHandle && viewerHandle === winnerHandle);
}

export function vaultDropRevealGivvyWinBanner(
  spin: VaultRevealSpinPayload,
  viewer?: VaultDropRevealViewer | null,
): string | null {
  if (!vaultDropRevealViewerWonGiveaway(spin, viewer)) return null;
  if (spin.giveawayKind === 'buyers') return 'Congrats — you won the Buyers Givvy!';
  return 'Congrats — you won the Givvy!';
}

export function isVaultSealRevealKind(kind: VaultRevealSpinKind): boolean {
  return kind === 'giveaway' || kind === 'break_pyt' || kind === 'random_reveal';
}

export function vaultSealMetaLine(spin: VaultRevealSpinPayload): string {
  const n = spin.labels.length;
  if (spin.kind === 'giveaway') {
    const lane = spin.giveawayKind === 'buyers' ? 'buyers givvy' : 'givvy';
    return `${n} ${n === 1 ? 'entry' : 'entries'} · verified ${lane} draw`;
  }
  if (spin.kind === 'random_reveal') {
    return `${n} remaining · verified reveal`;
  }
  return `${n} ${n === 1 ? 'spot' : 'spots'} · verified randomizer`;
}

export type VaultSealWinnerCopy = {
  kicker: string;
  primary: string;
  sub?: string;
  detail?: string;
};

function formatWinnerHandle(label: string): string {
  const bare = label.trim().replace(/^@/, '');
  return bare ? `@${bare}` : '@winner';
}

export function vaultSealWinnerCopy(spin: VaultRevealSpinPayload): VaultSealWinnerCopy {
  const winner = spin.winnerLabel.trim();
  const buyer = spin.buyerUsername?.trim().replace(/^@/, '');

  if (spin.kind === 'giveaway') {
    return {
      kicker: spin.giveawayKind === 'buyers' ? 'Buyers Givvy winner' : 'Givvy winner',
      primary: formatWinnerHandle(spin.winnerLabel),
      sub: 'Takes home',
      detail: spin.title,
    };
  }
  if (spin.kind === 'random_reveal') {
    const left = Math.max(0, spin.labels.length - 1);
    return {
      kicker: 'Your team',
      primary: winner || '—',
      sub: buyer ? `@${buyer}` : undefined,
      detail:
        left > 0
          ? `${left} ${left === 1 ? 'spot' : 'spots'} left in the pool`
          : 'Final spot revealed',
    };
  }
  return {
    kicker: 'First pick',
    primary: winner || '—',
    sub: spin.assignments?.length ? `${spin.assignments.length} spots randomized` : 'Assignments locked',
  };
}

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
  const giveawayKind =
    spin.giveawayKind === 'buyers' ? 'buyers' : spin.giveawayKind === 'open' ? 'open' : undefined;

  return {
    spinId,
    kind,
    giveawayKind,
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
    winnerUserId: typeof spin.winnerUserId === 'string' ? spin.winnerUserId : undefined,
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
