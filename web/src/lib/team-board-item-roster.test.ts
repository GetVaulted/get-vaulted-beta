import { describe, expect, it } from "vitest";
import {
  resolveTeamAbbrFromVariantLabel,
  teamBoardTeamsForActiveItem,
  TEAM_BOARD_SETS,
} from "@/lib/team-board-sets";

describe("resolveTeamAbbrFromVariantLabel", () => {
  it("uses preset color abbr", () => {
    expect(resolveTeamAbbrFromVariantLabel("nfl", "Chiefs", "KC")).toBe("KC");
  });

  it("matches display name when color is a pack id", () => {
    expect(resolveTeamAbbrFromVariantLabel("nfl", "Bills", "nfl_teams")).toBe("BUF");
  });

  it("matches full city-style labels", () => {
    expect(resolveTeamAbbrFromVariantLabel("nfl", "Buffalo Bills", "")).toBe("BUF");
  });
});

describe("teamBoardTeamsForActiveItem", () => {
  it("returns full NFL set for random assignment", () => {
    const teams = teamBoardTeamsForActiveItem({
      league: "nfl",
      salesFormat: "variant_selection",
      variantAssignmentMode: "random",
      variants: [{ label: "Random NFL Team", color: "nfl_teams" }],
    });
    expect(teams).toEqual([...TEAM_BOARD_SETS.nfl]);
  });

  it("filters to pick-mode item variants", () => {
    const teams = teamBoardTeamsForActiveItem({
      league: "nfl",
      salesFormat: "variant_selection",
      variantAssignmentMode: "pick",
      variants: [
        { label: "Bills", color: "BUF" },
        { label: "Chiefs", color: "KC" },
        { label: "Cowboys", color: "DAL" },
        { label: "Eagles", color: "PHI" },
        { label: "49ers", color: "SF" },
        { label: "Ravens", color: "BAL" },
      ],
    });
    expect(teams).toEqual(["BAL", "BUF", "DAL", "KC", "PHI", "SF"]);
  });

  it("skips removed variants and appends MISC when flagged", () => {
    const teams = teamBoardTeamsForActiveItem({
      league: "nfl",
      salesFormat: "variant_selection",
      variantAssignmentMode: "pick",
      includeMisc: true,
      variants: [
        { label: "Bills", color: "BUF" },
        { label: "Retired", color: "KC", status: "removed" },
      ],
    });
    expect(teams).toEqual(["BUF", "MISC"]);
  });

  it("keeps full league when variants are not team-resolvable", () => {
    const teams = teamBoardTeamsForActiveItem({
      league: "nfl",
      salesFormat: "variant_selection",
      variantAssignmentMode: "pick",
      variants: [{ label: "Spot A", color: "" }, { label: "Spot B", color: "" }],
    });
    expect(teams).toEqual([...TEAM_BOARD_SETS.nfl]);
  });
});
