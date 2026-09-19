import { describe, expect, it } from "vitest";
import {
  buildPlayerPickVariants,
  buildRandomPlayerVariant,
  normalizeCustomRandomPoolLabels,
  parsePlayerSpotList,
  playerSpotReelAbbr,
  PLAYER_SPOT_MAX,
} from "../../../shared/live-player-spot-list";

describe("parsePlayerSpotList", () => {
  it("parses unique names", () => {
    const r = parsePlayerSpotList("Mahomes\nAllen\nHurts");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.names).toEqual(["Mahomes", "Allen", "Hurts"]);
  });

  it("rejects duplicates case-insensitively", () => {
    const r = parsePlayerSpotList("Mahomes\nmahomes\nAllen");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/Duplicate/i);
  });

  it("rejects fewer than 2 names", () => {
    const r = parsePlayerSpotList("Mahomes");
    expect(r.ok).toBe(false);
  });

  it("rejects more than max names", () => {
    const lines = Array.from({ length: PLAYER_SPOT_MAX + 1 }, (_, i) => `Player ${i + 1}`).join("\n");
    const r = parsePlayerSpotList(lines);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/At most/i);
  });

  it("trims blanks and collapses spaces", () => {
    const r = parsePlayerSpotList("  Patrick  Mahomes  \n\n\nJosh Allen\n");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.names).toEqual(["Patrick Mahomes", "Josh Allen"]);
  });
});

describe("player variant builders", () => {
  it("builds pick variants", () => {
    const variants = buildPlayerPickVariants(["A", "B"], 12);
    expect(variants).toHaveLength(2);
    expect(variants[0]).toMatchObject({ label: "A", priceUsd: 12, color: "PLAYER" });
  });

  it("builds random pool seat", () => {
    const v = buildRandomPlayerVariant(20, 5);
    expect(v).toMatchObject({ label: "Random Player", quantityInitial: 5, color: "player_list" });
  });

  it("normalizes custom pool labels", () => {
    expect(normalizeCustomRandomPoolLabels(["A", " a ", "B", 3, ""])).toEqual(["A", "B"]);
    expect(normalizeCustomRandomPoolLabels(["OnlyOne"])).toBeNull();
  });

  it("builds reel abbr from first word", () => {
    expect(playerSpotReelAbbr("Patrick Mahomes")).toBe("PATRIC");
  });
});
