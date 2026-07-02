/** Deterministic decelerating pool roll — cycles real labels, lands on winnerIndex. */

export type VaultDropPoolRunStep = {
  labelIndex: number;
  delayMs: number;
};

/** Keep pool roll snappy even for 32-team breaks (~2–2.8s before the slam). */
function poolStepBudget(labelCount: number): number {
  if (labelCount <= 4) return 11;
  if (labelCount <= 12) return 16;
  if (labelCount <= 24) return 22;
  return 26;
}

/** Final snap-to-winner animation (ms) — keep in sync with reel overlays. */
export const VAULT_DROP_REEL_LAND_MS = 540;

/** Repeat labels so the reel can scroll forward without wrapping backward. */
export const VAULT_DROP_REEL_LANE_COPIES = 3;

export function buildVaultDropReelLane<T>(items: readonly T[], copies = VAULT_DROP_REEL_LANE_COPIES): T[] {
  if (items.length === 0) return [];
  return Array.from({ length: copies }, () => items).flat();
}

/** Middle copy + first pool label — scroll index only increases from here. */
export function vaultDropReelLaneStartScrollIndex(labelCount: number, firstLabelIndex: number): number {
  if (labelCount <= 0) return 0;
  return labelCount + Math.max(0, Math.min(firstLabelIndex, labelCount - 1));
}

export function reelStepAnimationMs(progress: number, landing: boolean, delayMs: number): number {
  if (landing) return VAULT_DROP_REEL_LAND_MS;
  if (progress < 0.72) return Math.max(42, Math.min(68, delayMs));
  if (progress < 0.92) return Math.max(100, Math.min(155, delayMs + 28));
  return Math.max(175, Math.min(250, delayMs + 40));
}

export function reelStepEasingCss(progress: number, landing: boolean): string {
  if (landing) return "540ms cubic-bezier(0.22, 1, 0.36, 1)";
  if (progress < 0.72) return `${reelStepAnimationMs(progress, false, 48)}ms linear`;
  if (progress < 0.92) return `${reelStepAnimationMs(progress, false, 120)}ms cubic-bezier(0.33, 1, 0.68, 1)`;
  return `${reelStepAnimationMs(progress, false, 180)}ms cubic-bezier(0.22, 1, 0.36, 1)`;
}

/** One team per step — scrolls smoothly and lands on the team before the winner, then snaps to winner. */
export function buildVaultDropPoolRun(labels: string[], winnerIndex: number): VaultDropPoolRunStep[] {
  const n = labels.length;
  if (n <= 0) return [];
  if (n === 1) return [{ labelIndex: 0, delayMs: 260 }];

  const win = Math.max(0, Math.min(winnerIndex, n - 1));
  const stepCount = poolStepBudget(n);
  const minDelay = 28;
  const maxDelay = n > 16 ? 132 : 112;

  const steps: VaultDropPoolRunStep[] = [];
  let idx = (win - stepCount - 1 + n * 8) % n;

  for (let step = 0; step < stepCount; step += 1) {
    idx = (idx + 1) % n;
    const progress = step / Math.max(1, stepCount - 1);
    const delayMs = Math.round(minDelay + (maxDelay - minDelay) * progress ** 2.15);
    steps.push({ labelIndex: idx, delayMs });
  }

  return steps;
}

export function vaultDropPoolRunAnimationMs(steps: readonly VaultDropPoolRunStep[]): number {
  if (steps.length === 0) return VAULT_DROP_REEL_LAND_MS;
  let total = VAULT_DROP_REEL_LAND_MS;
  const last = Math.max(1, steps.length - 1);
  steps.forEach((step, i) => {
    total += reelStepAnimationMs(i / last, false, step.delayMs);
  });
  return total;
}

export function vaultDropPoolRunDurationMs(steps: readonly VaultDropPoolRunStep[]): number {
  return steps.reduce((sum, step) => sum + step.delayMs, 0);
}

export function vaultDropPoolPhaseCopy(progress: number): string {
  if (progress < 0.72) return 'Rolling the pool';
  if (progress < 0.94) return 'Slowing down';
  return 'Locked';
}

/** Big pill text during pool — never leak the winner before the reveal slam. */
export function vaultDropPoolRollingLabel(
  labels: string[],
  winnerIndex: number,
  cycleIndex: number,
  phase: 'pool' | 'reveal',
): string {
  const win = Math.max(0, Math.min(winnerIndex, labels.length - 1));
  if (phase === 'reveal') return labels[win]?.trim() || '—';
  if (cycleIndex === win) return '—';
  return labels[cycleIndex]?.trim() || '—';
}

export function vaultDropPoolChipActive(
  index: number,
  cycleIndex: number,
  winnerIndex: number,
  phase: 'pool' | 'reveal',
): boolean {
  if (index !== cycleIndex) return false;
  if (phase === 'reveal') return true;
  const win = Math.max(0, Math.min(winnerIndex, Number.MAX_SAFE_INTEGER));
  return index !== win;
}
