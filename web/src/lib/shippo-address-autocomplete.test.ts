import { describe, expect, it, vi } from "vitest";
import {
  resolveShippoAutocompleteAddress,
  searchShippoAddressAutocomplete,
} from "@/lib/shippo-address-autocomplete";

vi.mock("@/lib/shippo", () => ({
  isShippoConfigured: vi.fn(() => true),
  shippoAutocompleteFind: vi.fn(),
  shippoAutocompleteRetrieve: vi.fn(),
}));

import { isShippoConfigured, shippoAutocompleteFind, shippoAutocompleteRetrieve } from "@/lib/shippo";

describe("shippo-address-autocomplete", () => {
  it("maps find results", async () => {
    vi.mocked(isShippoConfigured).mockReturnValue(true);
    vi.mocked(shippoAutocompleteFind).mockResolvedValue({
      results: [{ id: "abc", text: "100 Main St, Austin, TX" }],
    });

    const rows = await searchShippoAddressAutocomplete({
      query: "100 Main",
      countryCode: "US",
    });
    expect(rows).toEqual([{ id: "abc", label: "100 Main St, Austin, TX", isContainer: false }]);
  });

  it("maps retrieve results to form fields", async () => {
    vi.mocked(shippoAutocompleteRetrieve).mockResolvedValue({
      address: {
        address_line_1: "100 Main St",
        address_line_2: "Apt 4",
        city_locality: "Austin",
        state_province: "TX",
        postal_code: "78701",
        country_code: "US",
      },
    });

    const resolved = await resolveShippoAutocompleteAddress("abc");
    expect(resolved).toEqual({
      line1: "100 Main St",
      line2: "Apt 4",
      city: "Austin",
      state: "TX",
      postalCode: "78701",
      country: "US",
    });
  });
});
