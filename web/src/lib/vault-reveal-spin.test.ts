import { describe, expect, it } from "vitest";
import {
  formatDivisionReelAbbr,
  vaultDropReelPillLabel,
  vaultDropRevealGivvyWinBanner,
  vaultDropRevealViewerWonGiveaway,
  type VaultRevealSpinPayload,
} from "./vault-reveal-spin";

const givvySpin = (overrides: Partial<VaultRevealSpinPayload> = {}): VaultRevealSpinPayload => ({
  spinId: "spin-1",
  kind: "giveaway",
  title: "Free pack",
  labels: ["@winner", "@loser"],
  winnerIndex: 0,
  winnerLabel: "@winner",
  winnerUserId: "user-winner",
  giveawayKind: "open",
  ...overrides,
});

describe("vault-reveal-spin givvy winner", () => {
  it("matches viewer by user id", () => {
    const spin = givvySpin();
    expect(vaultDropRevealViewerWonGiveaway(spin, { userId: "user-winner" })).toBe(true);
    expect(vaultDropRevealGivvyWinBanner(spin, { userId: "user-winner" })).toBe(
      "Congrats — you won the Givvy!",
    );
  });

  it("matches viewer by username when id is missing", () => {
    const spin = givvySpin({ winnerUserId: undefined });
    expect(vaultDropRevealViewerWonGiveaway(spin, { username: "@Winner" })).toBe(true);
  });

  it("uses buyers givvy copy", () => {
    const spin = givvySpin({ giveawayKind: "buyers" });
    expect(vaultDropRevealGivvyWinBanner(spin, { userId: "user-winner" })).toBe(
      "Congrats — you won the Buyers Givvy!",
    );
  });

  it("returns null for non-winners and non-givvy spins", () => {
    const spin = givvySpin();
    expect(vaultDropRevealGivvyWinBanner(spin, { userId: "other-user" })).toBeNull();
    expect(
      vaultDropRevealGivvyWinBanner(
        { ...spin, kind: "random_reveal", giveawayKind: undefined },
        { userId: "user-winner" },
      ),
    ).toBeNull();
  });
});

describe("vault drop reel pill labels", () => {
  it("abbreviates PYD division names for the reel", () => {
    expect(formatDivisionReelAbbr("AFC East")).toBe("AFC E");
    expect(formatDivisionReelAbbr("NFC West")).toBe("NFC W");
  });

  it("prefers segment abbrs for random reveal pills", () => {
    const spin: VaultRevealSpinPayload = {
      spinId: "random-1",
      kind: "random_reveal",
      title: "PYD Break",
      labels: ["AFC East", "AFC North"],
      segmentAbbrs: ["AFC E", "AFC N"],
      winnerIndex: 0,
      winnerLabel: "AFC East",
      durationMs: 2400,
    };
    expect(vaultDropReelPillLabel(spin, 0)).toBe("AFC E");
    expect(vaultDropReelPillLabel(spin, 1)).toBe("AFC N");
  });
});
