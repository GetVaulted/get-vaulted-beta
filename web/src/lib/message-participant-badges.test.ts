import { describe, expect, it } from "vitest";
import { shapeParticipantBadges } from "@/lib/message-participant-badges";

describe("shapeParticipantBadges", () => {
  it("labels only people who have sold, and flags verified emails", () => {
    const map = shapeParticipantBadges(
      [
        { id: "seller", sellerLevel: "vault_seller", emailVerified: new Date() },
        { id: "buyer", sellerLevel: "vault_seller", emailVerified: null },
      ],
      new Set(["seller"]),
    );
    expect(map.get("seller")).toEqual({ sellerLevelLabel: "Vault Seller", verified: true });
    expect(map.get("buyer")).toEqual({ sellerLevelLabel: null, verified: false });
  });
});
