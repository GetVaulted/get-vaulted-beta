import { describe, expect, it } from "vitest";
import {
  normalizeUsernameForShippoLabel,
  shippoLabelTrackingExtra,
  withShippoParcelLabelTracking,
} from "@/lib/shippo-label-references";

describe("shippo-label-references", () => {
  it("formats username with a single @ and truncates to 50", () => {
    expect(normalizeUsernameForShippoLabel("vaultbuyer")).toBe("@vaultbuyer");
    expect(normalizeUsernameForShippoLabel("@@vaultbuyer")).toBe("@vaultbuyer");
    expect(normalizeUsernameForShippoLabel("a".repeat(60))).toBe(`@${"a".repeat(49)}`);
  });

  it("builds shipment extra for label tracking", () => {
    expect(shippoLabelTrackingExtra({ username: "buyer1", secondary: "Order abc" })).toEqual({
      reference_1: "@buyer1",
      reference_2: "Order abc",
    });
    expect(shippoLabelTrackingExtra({})).toEqual({});
  });

  it("merges parcel extra without dropping existing keys", () => {
    const parcel = withShippoParcelLabelTracking(
      { weight: "8", extra: { signature_required: false } },
      shippoLabelTrackingExtra({ username: "x" }),
    );
    expect(parcel.extra).toEqual({ signature_required: false, reference_1: "@x" });
  });
});
