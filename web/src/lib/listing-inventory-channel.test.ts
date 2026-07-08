import { describe, expect, it } from "vitest";
import {
  embedListingInventoryChannel,
  parseListingInventoryChannel,
  stripListingInventoryChannelMarker,
} from "@/lib/listing-inventory-channel";

describe("listing-inventory-channel", () => {
  it("embeds and parses marketplace channel marker", () => {
    const embedded = embedListingInventoryChannel("Nice card.", "marketplace");
    expect(parseListingInventoryChannel(embedded)).toBe("marketplace");
    expect(stripListingInventoryChannelMarker(embedded)).toBe("Nice card.");
  });

  it("strips marker from buyer-facing description", () => {
    expect(stripListingInventoryChannelMarker("Test product\n<!--gv-inventory:marketplace-->")).toBe("Test product");
    expect(stripListingInventoryChannelMarker("<!--gv-inventory:live_show-->")).toBe("");
  });
});
