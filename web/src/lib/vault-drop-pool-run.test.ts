import { describe, expect, it } from "vitest";
import {
  buildVaultDropPoolRun,
  vaultDropPoolChipActive,
  vaultDropPoolPhaseCopy,
  vaultDropPoolRollingLabel,
  vaultDropPoolRunAnimationMs,
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
