import { describe, expect, it } from "vitest";
import {
  buildVaultDropPoolRun,
  buildVaultDropReelScrollPlan,
  vaultDropPoolChipActive,
  vaultDropPoolPhaseCopy,
  vaultDropPoolRollingLabel,
  vaultDropPoolRunAnimationMs,
  VAULT_DROP_REEL_LAND_MS,
  VAULT_DROP_REEL_FOCUS_RING_TOP_NUDGE,
  VAULT_DROP_REEL_PILL_HEIGHT,
  VAULT_DROP_REEL_PILL_SPAN,
  VAULT_DROP_REEL_PILL_WIDTH,
  VAULT_DROP_REEL_SPIN_EXTRA_MS,
  vaultDropReelCenterOffset,
  vaultDropReelFocusRingPosition,
} from "../../../shared/vault-drop-pool-run";

describe("buildVaultDropPoolRun", () => {
  it("ends one spot before the winner so the landing snap can lock on the draw", () => {
    const labels = ["A", "B", "C", "D", "E"];
    const win = 2;
    const steps = buildVaultDropPoolRun(labels, win);
    expect(steps.length).toBeGreaterThan(5);
    expect(steps[steps.length - 1]?.labelIndex).toBe((win - 1 + labels.length) % labels.length);
  });

  it("slows down toward the end without dragging for large pools", () => {
    const steps = buildVaultDropPoolRun(Array.from({ length: 8 }, (_, i) => `Team ${i}`), 5);
    const first = steps[0]?.delayMs ?? 0;
    const last = steps[steps.length - 1]?.delayMs ?? 0;
    expect(last).toBeGreaterThan(first);
    const duration = vaultDropPoolRunAnimationMs(steps);
    expect(duration).toBeGreaterThan(1200);
    expect(duration).toBeLessThan(5200);
  });

  it("keeps nfl-sized pools under ~5s", () => {
    const labels = Array.from({ length: 32 }, (_, i) => `Team ${i}`);
    const duration = vaultDropPoolRunAnimationMs(buildVaultDropPoolRun(labels, 17));
    expect(duration).toBeLessThan(5200);
  });

  it("handles single-entry pools", () => {
    const steps = buildVaultDropPoolRun(["Only"], 0);
    expect(steps).toEqual([{ labelIndex: 0, delayMs: 260 }]);
  });
});

describe("buildVaultDropReelScrollPlan", () => {
  it("spins continuously and stops on the winner slot", () => {
    const labels = ["A", "B", "C", "D", "E"];
    const win = 2;
    const steps = buildVaultDropPoolRun(labels, win);
    const plan = buildVaultDropReelScrollPlan(labels, win);

    expect(plan.steps).toEqual(steps);
    expect(plan.winnerScrollIndex).toBe(plan.laneStartScroll + steps.length);
    expect(plan.spinEndScroll).toBe(plan.winnerScrollIndex);
    expect(plan.winnerScrollIndex).toBeLessThan(plan.laneCopyCount * labels.length);
    expect(plan.spinDurationMs).toBeGreaterThanOrEqual(900 + VAULT_DROP_REEL_SPIN_EXTRA_MS);
    expect(plan.landDurationMs).toBe(VAULT_DROP_REEL_LAND_MS);
    expect(plan.totalAnimationMs).toBe(plan.spinDurationMs + plan.landDurationMs);
  });

  it("adds extra lane copies for 8-division pools so the reel never scrolls into empty space", () => {
    const labels = Array.from({ length: 8 }, (_, i) => `AFC ${i}`);
    const plan = buildVaultDropReelScrollPlan(labels, 3);
    expect(plan.laneCopyCount).toBeGreaterThan(3);
    expect(plan.winnerScrollIndex).toBeLessThan(plan.laneCopyCount * labels.length);
  });

  it("centers slots under the viewport midpoint", () => {
    expect(vaultDropReelCenterOffset(300, 0)).toBe(300 / 2 - VAULT_DROP_REEL_PILL_SPAN / 2);
    expect(vaultDropReelCenterOffset(300, 2)).toBe(300 / 2 - VAULT_DROP_REEL_PILL_SPAN / 2 - 2 * VAULT_DROP_REEL_PILL_SPAN);
  });

  it("matches the focus ring to the pill footprint", () => {
    const ring = vaultDropReelFocusRingPosition(300, 52);
    expect(ring.width).toBe(VAULT_DROP_REEL_PILL_WIDTH);
    expect(ring.height).toBe(VAULT_DROP_REEL_PILL_HEIGHT);
    expect(ring.left).toBe(300 / 2 - VAULT_DROP_REEL_PILL_WIDTH / 2);
    expect(ring.top).toBe(6 + VAULT_DROP_REEL_FOCUS_RING_TOP_NUDGE);
  });
});

describe("vaultDropPoolPhaseCopy", () => {
  it("moves from rolling to locked", () => {
    expect(vaultDropPoolPhaseCopy(0.2)).toBe("Rolling the pool");
    expect(vaultDropPoolPhaseCopy(0.95)).toBe("Locked");
  });
});

describe("vaultDropPoolRollingLabel", () => {
  it("hides the winner during the pool phase", () => {
    const labels = ["Bills", "Chiefs", "Eagles"];
    expect(vaultDropPoolRollingLabel(labels, 1, 1, "pool")).toBe("—");
    expect(vaultDropPoolRollingLabel(labels, 1, 0, "pool")).toBe("Bills");
    expect(vaultDropPoolRollingLabel(labels, 1, 1, "reveal")).toBe("Chiefs");
  });
});

describe("vaultDropPoolChipActive", () => {
  it("does not highlight the winner chip until reveal", () => {
    expect(vaultDropPoolChipActive(2, 2, 2, "pool")).toBe(false);
    expect(vaultDropPoolChipActive(2, 2, 2, "reveal")).toBe(true);
    expect(vaultDropPoolChipActive(0, 0, 2, "pool")).toBe(true);
  });
});
