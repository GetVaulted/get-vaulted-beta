import { describe, expect, it } from "vitest";
import { marketplaceSellerItemSoldNotification } from "./marketplace-seller-item-sold-notification";

describe("marketplaceSellerItemSoldNotification", () => {
  it("uses item_sold copy for marketplace sellers", () => {
    const note = marketplaceSellerItemSoldNotification({
      listingTitle: "2020 Prizm Silver Rookie PSA 10",
      itemPriceUsd: 125,
      orderId: "order_1",
    });
    expect(note.type).toBe("item_sold");
    expect(note.title).toBe("Your item sold");
    expect(note.body).toContain("sold for $125");
    expect(note.href).toBe("/orders/order_1");
  });
});
