import { describe, expect, it } from "vitest";
import {
  deriveSellerLayawayPresentation,
  isActiveLayawayListRow,
  orderQualifiesForSellerFulfillment,
} from "@/lib/marketplace/layaway-commerce-state";
import { PAYMENT_LAYAWAY_ACTIVE } from "@/lib/layaway/constants";
import { PAYMENT_PAID } from "@/services/payments";

describe("layaway-commerce-state", () => {
  it("paid order qualifies for seller fulfillment even if layaway row is stale active", () => {
    expect(
      orderQualifiesForSellerFulfillment({
        paymentStatus: PAYMENT_PAID,
        layawayStatus: "active",
        listingStatus: "sold",
      }),
    ).toBe(true);
  });

  it("in-progress layaway order is excluded from seller fulfillment", () => {
    expect(
      orderQualifiesForSellerFulfillment({
        paymentStatus: PAYMENT_LAYAWAY_ACTIVE,
        layawayStatus: "active",
        listingStatus: "layaway_reserved",
      }),
    ).toBe(false);
  });

  it("sold listing with stale active layaway is not an active layaway list row", () => {
    expect(
      isActiveLayawayListRow({
        status: "active",
        dueAt: new Date(Date.now() + 86_400_000),
        remainingBalanceUsd: 100,
        orderPaymentStatus: PAYMENT_PAID,
        listingStatus: "sold",
      }),
    ).toBe(false);
  });

  it("maps paid stale layaway to readyToShip presentation", () => {
    const ui = deriveSellerLayawayPresentation({
      status: "active",
      dueAt: new Date(),
      remainingBalanceUsd: 50,
      orderPaymentStatus: PAYMENT_PAID,
      listingStatus: "sold",
    });
    expect(ui.bucket).toBe("readyToShip");
    expect(ui.displayStatus).toBe("completed");
  });
});
