import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  sessionFind: vi.fn(),
  spinsFind: vi.fn(),
  lotsFind: vi.fn(),
  pkgCreate: vi.fn(),
  financeFind: vi.fn(),
  orderFind: vi.fn(),
  orderUpdate: vi.fn(),
  createShipment: vi.fn(),
  listRates: vi.fn(),
  purchase: vi.fn(),
  getTx: vi.fn(),
  ensureFinance: vi.fn(),
  charge: vi.fn(),
  markFailed: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    liveShippingSession: { findFirst: m.sessionFind },
    liveItemVariantPurchase: { findMany: m.spinsFind },
    liveRoomItem: { findMany: m.lotsFind },
    shipmentPackage: { create: m.pkgCreate },
    shipmentLabelFinance: { findFirst: m.financeFind },
    order: { findUnique: m.orderFind, update: m.orderUpdate },
  },
}));
vi.mock("@/lib/notifications", () => ({ createNotification: m.notify }));
vi.mock("@/lib/seller-commerce-event", () => ({ SELLER_COMMERCE_KIND: {}, logSellerCommerceEvent: vi.fn() }));
vi.mock("@/lib/shippo-label-contacts", () => ({
  BUYER_SHIPPO_CONTACT_MISSING: "BUYER_CONTACT_INCOMPLETE",
  SELLER_SHIPPO_CONTACT_MISSING: "SELLER_CONTACT_INCOMPLETE",
  resolveBuyerShippoContact: () => ({ email: "b@x.com", phone: "1" }),
  resolveSellerShippoContact: () => ({ email: "s@x.com", phone: "1" }),
  withShippoContact: (a: object) => a,
}));
vi.mock("@/lib/shippo", () => ({
  isShippoConfigured: () => true,
  shippoCreateShipment: m.createShipment,
  shippoGetTransaction: m.getTx,
  shippoListRates: m.listRates,
  shippoPurchaseRate: m.purchase,
}));
vi.mock("@/lib/shippo-label-references", () => ({
  normalizeUsernameForShippoLabel: (u: string) => u,
  shippoLabelTrackingExtra: () => ({}),
  withShippoParcelLabelTracking: (p: object) => p,
}));
vi.mock("@/services/payments", () => ({ PAYMENT_PAID: "paid" }));
vi.mock("@/services/shipping/live-shipping-pricing", () => ({ LIVE_BUNDLED_SHIPPING_DESTINATION_KEY: "__default__" }));
vi.mock("@/services/shipping/live-shipping-quote", () => ({ buildSessionPackageGroups: vi.fn() }));
vi.mock("@/lib/unified-shipping-engine", () => ({
  filterShippoRatesUspsUps: (r: unknown[]) => r,
  selectShippoRatesForSellerQuote: (r: unknown[]) => r,
}));
vi.mock("@/services/shipping/shippo-label-refund-status", () => ({
  isShippoLabelPurchaseSuccessful: (a: { status: string; labelUrl: string | null }) => a.status === "SUCCESS" && !!a.labelUrl,
}));
vi.mock("@/lib/seller-shipping-label-state", () => ({
  orderHasUsableShippingLabel: (o: { labelUrl: string | null }) => !!o.labelUrl,
}));
vi.mock("@/services/shipping/label-finance", () => ({ ensureShipmentLabelFinanceRecord: m.ensureFinance }));
vi.mock("@/services/shipping/charge-seller-label-cost", () => ({
  chargeSellerForLabelCost: m.charge,
  markOrderLabelCostReversalFailed: m.markFailed,
}));

import { generateAdditionalBundledLabelForSession } from "@/services/shipping/bundled-labels";

const parcel = { weightOz: 80, lengthIn: 14, widthIn: 12, heightIn: 12 };

function order(id: string, extra: Partial<Record<string, unknown>> = {}) {
  return {
    id,
    buyerId: "buyer-1",
    sellerId: "seller-1",
    paymentStatus: "paid",
    fulfillmentStatus: "pending",
    shippoTransactionId: null,
    labelUrl: null,
    shipRecipientName: "Pat",
    shipAddress: "1 Main",
    shipCity: "Austin",
    shipState: "TX",
    shipZip: "78701",
    shipCountry: "US",
    buyer: { email: "b@x.com", username: "pat" },
    buyerAddress: { email: null, phone: "1" },
    listing: { id: `l-${id}`, title: "Spot", shipAlone: false, parcelWeightOz: null, shippingBaseWeightOz: 4, parcelLengthIn: null, parcelWidthIn: null, parcelHeightIn: null },
    ...extra,
  };
}

function session(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "sess-1",
    sellerId: "seller-1",
    destinationAddressId: null,
    seller: { email: "s@x.com", shipFromStreet: "9 Ship", shipFromCity: "Reno", shipFromState: "NV", shipFromZip: "89501", shipFromCountry: "US", shipFromName: "Sel", defaultShipFromAddress: null },
    packages: [{ id: "pk0", packageIndex: 0, shippoTransactionId: "tx0" }],
    orders: [order("o1", { labelUrl: "https://label/1", shippoTransactionId: "tx0" }), order("o2"), order("o3")],
    ...over,
  };
}

const surpriseSpin = (id: string) => ({ fulfillmentOrderId: id, liveRoomItemId: "lot-1" });

describe("generateAdditionalBundledLabelForSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.sessionFind.mockResolvedValue(session());
    m.spinsFind.mockResolvedValue([surpriseSpin("o1"), surpriseSpin("o2"), surpriseSpin("o3")]);
    m.lotsFind.mockResolvedValue([{ id: "lot-1", surpriseSetItems: [{ name: "Helmet", quantity: 3 }] }]);
    m.createShipment.mockResolvedValue({ object_id: "shp-1" });
    m.listRates.mockResolvedValue({
      results: [
        { object_id: "r-ups", amount: "30.00", provider: "UPS", servicelevel: { name: "Ground" } },
        { object_id: "r-usps", amount: "20.00", provider: "USPS", servicelevel: { name: "Priority Mail" } },
      ],
    });
    m.purchase.mockResolvedValue({ object_id: "tx-new", tracking_number: "TRK1", tracking_url_provider: "https://t", label_url: "https://label/new", status: "SUCCESS", object_state: "VALID" });
    m.pkgCreate.mockResolvedValue({ id: "pk-new" });
    m.financeFind.mockResolvedValue({ orderId: "o1" });
    m.orderFind.mockResolvedValue({ shippingLabelCostCents: 1500 });
    m.charge.mockResolvedValue({ ok: true });
  });

  it("buys one extra package, ledgers it as additional_package and deducts from the seller", async () => {
    const r = await generateAdditionalBundledLabelForSession("sess-1", "seller-1", { parcel });
    expect(r).toMatchObject({ packageIndex: 1, packagesBought: 2, maxPackages: 3, shippingLabelCostCents: 2000, labelUrl: "https://label/new" });
    expect(m.purchase).toHaveBeenCalledTimes(1);
    expect(m.purchase.mock.calls[0]![0]).toBe("r-usps"); // cheapest by default
    expect(m.pkgCreate.mock.calls[0]![0].data).toMatchObject({ packageIndex: 1, status: "label_created", liveShippingSessionId: "sess-1" });
    expect(m.ensureFinance).toHaveBeenCalledWith(expect.objectContaining({ orderId: "o1", purpose: "additional_package", labelCostCents: 2000 }));
    expect(m.charge).toHaveBeenCalledWith(expect.objectContaining({ orderId: "o1", labelCostCents: 2000, purpose: "additional_package", packageIndex: 1 }));
    expect(m.orderUpdate).toHaveBeenCalledWith({ where: { id: "o1" }, data: { shippingLabelCostCents: 3500 } });
    expect(m.notify).toHaveBeenCalledTimes(2);
  });

  it("honours the seller's chosen carrier + service when the new shipment offers it", async () => {
    await generateAdditionalBundledLabelForSession("sess-1", "seller-1", {
      parcel,
      preferredRate: { objectId: "stale-rate-id", carrier: "UPS", service: "Ground" },
    });
    expect(m.purchase.mock.calls[0]![0]).toBe("r-ups");
  });

  it("refuses a bundle with no first label, fewer than two spins, or every label already bought", async () => {
    m.sessionFind.mockResolvedValue(session({ orders: [order("o1"), order("o2")] }));
    await expect(generateAdditionalBundledLabelForSession("sess-1", "seller-1", { parcel })).rejects.toThrow("NO_PRIMARY_LABEL_YET");

    m.sessionFind.mockResolvedValue(session());
    m.spinsFind.mockResolvedValue([surpriseSpin("o1")]);
    await expect(generateAdditionalBundledLabelForSession("sess-1", "seller-1", { parcel })).rejects.toThrow("ADDITIONAL_LABELS_UNAVAILABLE");

    m.spinsFind.mockResolvedValue([surpriseSpin("o1"), surpriseSpin("o2"), surpriseSpin("o3")]);
    m.sessionFind.mockResolvedValue(
      session({ packages: [0, 1, 2].map((i) => ({ id: `pk${i}`, packageIndex: i, shippoTransactionId: `tx${i}` })) }),
    );
    await expect(generateAdditionalBundledLabelForSession("sess-1", "seller-1", { parcel })).rejects.toThrow("ALL_LABELS_BOUGHT");
    expect(m.purchase).not.toHaveBeenCalled();
  });

  it("counts the first label even when no package row was recorded for it (older bundles)", async () => {
    m.sessionFind.mockResolvedValue(session({ packages: [] }));
    const r = await generateAdditionalBundledLabelForSession("sess-1", "seller-1", { parcel });
    expect(r.packagesBought).toBe(2);
    expect(r.packageIndex).toBe(0);
  });

  it("rejects bad weights/dimensions before calling Shippo", async () => {
    for (const bad of [{ ...parcel, weightOz: 0 }, { ...parcel, lengthIn: Number.NaN }, { ...parcel, weightOz: 2000 }]) {
      await expect(generateAdditionalBundledLabelForSession("sess-1", "seller-1", { parcel: bad })).rejects.toThrow("INVALID_PARCEL");
    }
    expect(m.createShipment).not.toHaveBeenCalled();
  });

  it("does not charge the seller when Shippo does not confirm the purchase", async () => {
    m.purchase.mockResolvedValue({ object_id: "tx-bad", status: "ERROR", label_url: null });
    m.getTx.mockResolvedValue({ status: "ERROR", label_url: null });
    await expect(generateAdditionalBundledLabelForSession("sess-1", "seller-1", { parcel })).rejects.toThrow("LABEL_PURCHASE_NOT_CONFIRMED");
    expect(m.charge).not.toHaveBeenCalled();
    expect(m.pkgCreate.mock.calls[0]![0].data.status).toBe("estimated");
  });

  it("returns a warning (not an error) when the seller deduction fails after a successful purchase", async () => {
    m.charge.mockResolvedValue({ ok: false, code: "X", error: "stripe down" });
    const r = await generateAdditionalBundledLabelForSession("sess-1", "seller-1", { parcel });
    expect(r.warning).toMatch(/could not be deducted/);
    expect(m.markFailed).toHaveBeenCalledWith("o1");
  });
});
