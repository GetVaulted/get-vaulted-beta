import { describe, expect, it, vi } from "vitest";

// The reveal module imports the generated Prisma client at runtime; these tests only exercise the
// payload builder, so stub it (keeps the test runnable without `prisma generate`).
vi.mock("@/generated/prisma/client", () => ({ Prisma: { PrismaClientKnownRequestError: class extends Error {} } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/realtime-emit-server", () => ({ emitVaultRevealSpinAndWait: vi.fn() }));

import {
  buildSurpriseCardFields,
  buildSurpriseCardShuffle,
  parseSurpriseCardFields,
  SURPRISE_CARD_MAX_ITEMS,
  SURPRISE_CARD_SHUFFLE_MS,
  SURPRISE_CARD_TOTAL_MS,
  surpriseCardShuffleDurationMs,
} from "../../../shared/surprise-reveal-card";
import { expandSurpriseSetLabels } from "../../../shared/surprise-set";
import { normalizeCustomRandomPoolLabels, PLAYER_SPOT_MAX } from "../../../shared/live-player-spot-list";
import { parseVaultRevealSpinPayload, vaultRevealDisplayMs } from "@/lib/vault-reveal-spin";
import { buildRandomRevealSpinPayload, surpriseSetItemNames } from "@/lib/live-item-variant-random-reveal";

const items = ["Random Pack 3", "Random Sports Pack 4", "Random Pack 5", "23-Chaser"];

describe("surprise reveal card", () => {
  it("strips the unit suffix and always includes the winner", () => {
    const f = buildSurpriseCardFields(items, "Random Pack 3 (12 of 34)");
    expect(f).toEqual({ style: "surprise_card", cardItems: items, cardWinner: "Random Pack 3" });
    const g = buildSurpriseCardFields(["A", "B"], "Chase");
    expect(g?.cardItems).toContain("Chase");
  });

  it("caps very large sets but keeps the winner", () => {
    const many = Array.from({ length: 120 }, (_, i) => `Item ${i}`);
    const f = buildSurpriseCardFields(many, "Item 119 (1 of 2)")!;
    expect(f.cardItems).toHaveLength(SURPRISE_CARD_MAX_ITEMS);
    expect(f.cardItems).toContain("Item 119");
  });

  it("round-trips through the spin parser", () => {
    const f = buildSurpriseCardFields(items, "23-Chaser")!;
    expect(parseSurpriseCardFields({ ...f })).toEqual(f);
    expect(parseSurpriseCardFields({ style: "other", cardWinner: "x" })).toBeNull();
    expect(parseSurpriseCardFields({ style: "surprise_card" })).toBeNull();
  });

  it("shuffles deterministically, slows down, and ends on the winner", () => {
    const f = buildSurpriseCardFields(items, "23-Chaser")!;
    const a = buildSurpriseCardShuffle(f, "random-p1");
    const b = buildSurpriseCardShuffle(f, "random-p1");
    expect(a).toEqual(b); // every viewer sees the same sequence
    expect(a.at(-1)!.name).toBe("23-Chaser");
    expect(a[0]!.holdMs).toBeLessThan(a.at(-2)!.holdMs);
    for (let i = 1; i < a.length; i++) expect(a[i]!.name === a[i - 1]!.name).toBe(false);
    const total = surpriseCardShuffleDurationMs(a);
    expect(total).toBeGreaterThanOrEqual(SURPRISE_CARD_SHUFFLE_MS - 100);
    expect(total).toBeLessThanOrEqual(SURPRISE_CARD_SHUFFLE_MS + 500);
    expect(buildSurpriseCardShuffle(f, "random-p2")).not.toEqual(a);
  });
});

describe("Surprise Set reveal payload", () => {
  it("tags Surprise Set draws with the card and keeps reel fields", () => {
    const spin = buildRandomRevealSpinPayload({
      purchaseId: "p1",
      itemTitle: "Multisport Megawheel",
      remaining: [
        { label: "Random Pack 3 (1 of 2)", abbr: "RANDOM" },
        { label: "23-Chaser", abbr: "23-CHA" },
      ],
      winnerIndex: 1,
      buyerUsername: "@chris",
      surpriseSetItemNames: ["Random Pack 3", "23-Chaser"],
    });
    expect(spin.spinId).toBe("random-p1");
    expect(spin.buyerUsername).toBe("chris");
    expect(spin.surpriseCard?.cardWinner).toBe("23-Chaser");
    const parsed = parseVaultRevealSpinPayload({ spin });
    expect(parsed?.surpriseCard?.cardWinner).toBe("23-Chaser");
    expect(vaultRevealDisplayMs(parsed!)).toBe(SURPRISE_CARD_TOTAL_MS);
  });

  it("leaves non-Surprise random reveals on the reel", () => {
    const spin = buildRandomRevealSpinPayload({
      purchaseId: "p2",
      itemTitle: "Random team",
      remaining: [{ label: "Bears", abbr: "CHI" }],
      winnerIndex: 0,
      buyerUsername: "x",
      surpriseSetItemNames: null,
    });
    expect(spin.surpriseCard).toBeUndefined();
  });

  it("reads item names from stored set JSON", () => {
    expect(surpriseSetItemNames([{ name: "A", quantity: 2, msrpUsd: 5 }, { name: "B", quantity: 1, msrpUsd: 9 }])).toEqual(["A", "B"]);
    expect(surpriseSetItemNames(null)).toBeNull();
    expect(surpriseSetItemNames([])).toBeNull();
  });
});

describe("500-unit pool", () => {
  it("keeps all 500 Surprise Set labels while player breaks stay capped", () => {
    const labels = expandSurpriseSetLabels([
      { name: "Chase", quantity: 1, msrpUsd: 100 },
      { name: "Pack", quantity: 499, msrpUsd: 5 },
    ]);
    expect(normalizeCustomRandomPoolLabels(labels, 500)).toHaveLength(500);
    expect(normalizeCustomRandomPoolLabels(labels)).toHaveLength(PLAYER_SPOT_MAX);
  });
});
