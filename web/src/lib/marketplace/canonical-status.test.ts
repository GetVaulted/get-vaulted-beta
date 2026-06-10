import { describe, expect, it } from "vitest";
import {
  isActiveLayawayListRow,
  isListingPurchasable,
  orderQualifiesForSellerFulfillment,
  resolveMarketplaceCanonicalStatus,
} from "@/lib/marketplace/canonical-status";
import { deriveSellerLayawayUi } from "@/lib/layaway/seller-ui-status";
import { PAYMENT_LAYAWAY_ACTIVE } from "@/lib/layaway/constants";
import { PAYMENT_PAID } from "@/services/payments";

describe("resolveMarketplaceCanonicalStatus", () => {
  it("available for active listing with no layaway", () => {
    expect(
      resolveMarketplaceCanonicalStatus({
        listingStatus: "active",
        orderPaymentStatus: null,
        layawayStatus: null,
      }),
    ).toBe("available");
  });

  it("layaway_active after deposit with balance due", () => {
    expect(
      resolveMarketplaceCanonicalStatus({
        listingStatus: "layaway_reserved",
        layawayStatus: "active",
        orderPaymentStatus: PAYMENT_LAYAWAY_ACTIVE,
        amountPaidUsd: 100,
        depositAmountUsd: 100,
        remainingBalanceUsd: 300,
      }),
    ).toBe("layaway_active");
  });

  it("sold when order paid even if layaway row still active", () => {
    expect(
      resolveMarketplaceCanonicalStatus({
        listingStatus: "sold",
        layawayStatus: "active",
        orderPaymentStatus: PAYMENT_PAID,
        remainingBalanceUsd: 100,
      }),
    ).toBe("sold");
  });
});

describe("canonical-status commerce guards", () => {
  it("paid order with stale active layaway appears in seller fulfillment", () => {
    expect(
      orderQualifiesForSellerFulfillment({
        paymentStatus: PAYMENT_PAID,
        layawayStatus: "active",
        listingStatus: "sold",
      }),
    ).toBe(true);
  });

  it("active layaway in progress is not seller fulfillment", () => {
    expect(
      orderQualifiesForSellerFulfillment({
        paymentStatus: PAYMENT_LAYAWAY_ACTIVE,
        layawayStatus: "active",
        listingStatus: "layaway_reserved",
      }),
    ).toBe(false);
  });

  it("sold paid listing is not an active seller layaway row", () => {
    expect(
      isActiveLayawayListRow({
        status: "active",
        dueAt: new Date(Date.now() + 86_400_000),
        remainingBalanceUsd: 200,
        orderPaymentStatus: PAYMENT_PAID,
        listingStatus: "sold",
      }),
    ).toBe(false);
  });

  it("blocks purchase when layaway active on listing", () => {
    expect(isListingPurchasable("layaway_active")).toBe(false);
    expect(isListingPurchasable("available")).toBe(true);
  });
});

describe("deriveSellerLayawayUi", () => {
  it("maps overdue active layaway to overdue bucket", () => {
    const ui = deriveSellerLayawayUi({
      status: "active",
      dueAt: new Date(Date.now() - 86_400_000),
      remainingBalanceUsd: 50,
    });
    expect(ui.bucket).toBe("overdueOrDefaulted");
    expect(ui.displayStatus).toBe("overdue");
  });
});
