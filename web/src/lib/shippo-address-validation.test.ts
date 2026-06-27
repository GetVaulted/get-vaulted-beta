import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/shippo", () => ({
  isShippoConfigured: vi.fn(() => true),
  shippoValidateAddress: vi.fn(),
}));

import { isShippoConfigured, shippoValidateAddress } from "@/lib/shippo";
import { verifyAddressForShipping } from "@/lib/shippo-address-validation";

describe("verifyAddressForShipping", () => {
  beforeEach(() => {
    vi.mocked(isShippoConfigured).mockReturnValue(true);
  });

  const base = {
    fullName: "Jane Collector",
    line1: "123 Main St",
    line2: null,
    city: "Austin",
    state: "TX",
    postalCode: "78701",
    country: "US",
  };

  it("returns verified fields when Shippo validates", async () => {
    vi.mocked(shippoValidateAddress).mockResolvedValue({
      name: "Jane Collector",
      street1: "123 Main St",
      city: "Austin",
      state: "TX",
      zip: "78701",
      country: "US",
      validation_results: { is_valid: true, messages: [] },
    });

    const result = await verifyAddressForShipping(base);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.verified).toBe(true);
      expect(result.fields.postalCode).toBe("78701");
    }
  });

  it("rejects invalid addresses with carrier messages", async () => {
    vi.mocked(shippoValidateAddress).mockResolvedValue({
      name: "Jane Collector",
      street1: "123 Main St",
      city: "Austin",
      state: "TX",
      zip: "00000",
      country: "US",
      validation_results: {
        is_valid: false,
        messages: [{ text: "Invalid Zip Code" }],
      },
    });

    const result = await verifyAddressForShipping(base);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.messages).toContain("Invalid Zip Code");
    }
  });

  it("skips verification when Shippo is not configured", async () => {
    vi.mocked(isShippoConfigured).mockReturnValue(false);
    const result = await verifyAddressForShipping(base);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.verified).toBe(false);
    }
  });
});
