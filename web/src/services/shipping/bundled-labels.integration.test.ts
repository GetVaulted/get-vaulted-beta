import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { PAYMENT_PAID } from "@/services/payments";
import { addOrderToLiveShippingSession } from "@/services/shipping/live-shipping-pricing";
import { generateBundledShippoLabelForSession } from "@/services/shipping/bundled-labels";
import {
  bootstrapIntegrationPrisma,
  resetIntegrationDatabase,
  seedBuyerShippingAddress,
  seedListing,
  seedOrder,
  seedSellerStripeAndShipFrom,
  seedUser,
  teardownIntegrationPrisma,
} from "@/test/integration-setup";

const shippoHoisted = vi.hoisted(() => ({
  create: vi.fn(),
  rates: vi.fn(),
  purchase: vi.fn(),
  getTransaction: vi.fn(),
}));

vi.mock("@/lib/shippo", () => ({
  isShippoConfigured: () => true,
  shippoCreateShipment: (...args: unknown[]) => shippoHoisted.create(...args) as Promise<unknown>,
  shippoListRates: (...args: unknown[]) => shippoHoisted.rates(...args) as Promise<unknown>,
  shippoPurchaseRate: (...args: unknown[]) => shippoHoisted.purchase(...args) as Promise<unknown>,
  // Production always does a post-purchase refetch when the purchase response's object_state
  // isn't a string (our purchase mocks below never set object_state) — see bundled-labels.ts's
  // "Refresh when not yet SUCCESS, missing label URL, or object_state unknown" block. Without
  // this export the call fails, gets silently swallowed by that block's own try/catch, and tests
  // still pass on assertions — but with a misleading console warning on every run. Echo back a
  // generically-successful transaction so the refetch behaves the same as production against a
  // real, already-successful Shippo transaction.
  shippoGetTransaction: (...args: unknown[]) => shippoHoisted.getTransaction(...args) as Promise<unknown>,
}));

vi.mock("@/services/shipping/charge-seller-label-cost", () => ({
  chargeSellerForLabelCost: vi.fn().mockResolvedValue({
    ok: true,
    reversedCents: 501,
    reversalId: "trr_bundle_1",
    skipped: false,
  }),
  markOrderLabelCostReversalFailed: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/services/payout/process-payout-tier-events", () => ({
  processLabelCreatedPayoutEvaluation: vi.fn().mockResolvedValue(undefined),
}));

describe("generateBundledShippoLabelForSession (integration)", () => {
  beforeAll(async () => {
    await bootstrapIntegrationPrisma();
  }, 180_000);

  afterAll(async () => {
    await teardownIntegrationPrisma();
    vi.unstubAllEnvs();
  });

  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
    shippoHoisted.create.mockReset();
    shippoHoisted.rates.mockReset();
    shippoHoisted.purchase.mockReset();
    shippoHoisted.getTransaction.mockReset();
    const { chargeSellerForLabelCost, markOrderLabelCostReversalFailed } = await import(
      "@/services/shipping/charge-seller-label-cost"
    );
    vi.mocked(chargeSellerForLabelCost).mockClear();
    vi.mocked(markOrderLabelCostReversalFailed).mockClear();
    vi.stubEnv("BUNDLE_WEIGHT_BUFFER_OZ", "0");
    shippoHoisted.create.mockResolvedValue({ object_id: "ship_bundle_1" });
    shippoHoisted.rates.mockResolvedValue({
      results: [
        {
          object_id: "rate_cheap",
          amount: "5.01",
          provider: "USPS",
          servicelevel: { name: "Priority" },
        },
      ],
    });
    shippoHoisted.purchase.mockResolvedValue({
      object_id: "tx_bundle_1",
      tracking_number: "1ZTRACKBUNDLE",
      tracking_url_provider: "https://track.example/bundle",
      label_url: "https://label.example/bundle.pdf",
      status: "SUCCESS",
    });
    // Generic "already successful" echo for the post-purchase refresh — see the shippoGetTransaction
    // mock comment above. No test asserts on fields that only this refetch populates (tracking
    // number / primary label url come from the original purchase response), so one shared default
    // covering every transaction id is sufficient.
    shippoHoisted.getTransaction.mockResolvedValue({
      status: "SUCCESS",
      label_url: "https://label.example/bundle.pdf",
      object_state: "VALID",
    });
  });

  async function seedAuctionWinOrder(args: {
    sellerId: string;
    buyerId: string;
    liveRoomId: string;
    parcelWeightOz?: number | null;
    parcelLengthIn?: number | null;
    parcelWidthIn?: number | null;
    parcelHeightIn?: number | null;
    shipAlone?: boolean;
  }) {
    const listing = await seedListing(prisma, {
      sellerId: args.sellerId,
      buyingFormat: "auction",
      status: "awaiting_auction_payment",
      shippingPriceUsd: 0,
      shippingCategory: "raw_card",
      shippingBaseWeightOz: 4,
      shippingIncrementalWeightOz: 1,
      parcelWeightOz: args.parcelWeightOz ?? null,
      parcelLengthIn: args.parcelLengthIn ?? null,
      parcelWidthIn: args.parcelWidthIn ?? null,
      parcelHeightIn: args.parcelHeightIn ?? null,
      shipAlone: args.shipAlone ?? false,
    });
    await prisma.liveRoomItem.create({
      data: {
        liveRoomId: args.liveRoomId,
        listingId: listing.id,
        title: listing.title,
        status: "sold",
      },
    });
    // Shippo buyer-contact resolution reads Order.buyerAddress.phone exclusively (no fallback
    // to any field on User) — every order that's meant to reach the real purchase path needs a
    // real Address row with a valid phone, not just the legacy denormalized shipTo fields.
    const buyerAddress = await seedBuyerShippingAddress(prisma, { userId: args.buyerId });
    return seedOrder(prisma, {
      listingId: listing.id,
      buyerId: args.buyerId,
      sellerId: args.sellerId,
      itemPriceUsd: 50,
      shippingPriceUsd: 0,
      paymentStatus: "pending",
      status: "pending",
      paymentLabel: "auction",
      buyerAddressId: buyerAddress.id,
    });
  }

  it("creates one Shippo transaction and applies tracking to all eligible paid orders", async () => {
    const seller = await seedSellerStripeAndShipFrom(prisma, {
      email: "blb_s@test.internal",
      username: "blbseller",
    });
    const buyer = await seedUser(prisma, { email: "blb_b@test.internal", username: "blbbuyer" });
    const live = await prisma.liveRoom.create({
      data: { sellerId: seller.id, title: "Bundle live", roomType: "auction", status: "live" },
    });
    const o1 = await seedAuctionWinOrder({
      sellerId: seller.id,
      buyerId: buyer.id,
      liveRoomId: live.id,
      parcelWeightOz: 10,
      parcelLengthIn: 10,
      parcelWidthIn: 8,
      parcelHeightIn: 4,
    });
    const o2 = await seedAuctionWinOrder({
      sellerId: seller.id,
      buyerId: buyer.id,
      liveRoomId: live.id,
      parcelWeightOz: 12,
      parcelLengthIn: 12,
      parcelWidthIn: 6,
      parcelHeightIn: 5,
    });
    const { sessionId } = await addOrderToLiveShippingSession(o1.id);
    await addOrderToLiveShippingSession(o2.id);
    await prisma.order.updateMany({
      where: { id: { in: [o1.id, o2.id] } },
      data: { paymentStatus: PAYMENT_PAID, status: "paid", shippingChargedCents: 500 },
    });

    const result = await generateBundledShippoLabelForSession(sessionId, seller.id);
    expect(result.alreadyExisted).toBe(false);
    expect(result.shippoTransactionId).toBe("tx_bundle_1");
    expect(result.orderIds).toHaveLength(2);
    expect(shippoHoisted.create).toHaveBeenCalledTimes(1);
    const createBody = shippoHoisted.create.mock.calls[0]?.[0] as {
      parcels: Array<{ weight: string; length: string; width: string; height: string }>;
    };
    // Real production weight/dims for a purchased bundle come from buildSessionPackageGroups,
    // which reads each order's *frozen* LiveShippingSessionItem.appliedWeightOz (set once, at
    // addOrderToLiveShippingSession time, and never re-derived from the listing's parcelWeightOz/
    // parcelLengthIn/etc. at purchase time — see live-shipping-pricing.ts's "keep weight frozen at
    // settle time" comment). This listing's shippingBaseWeightOz/shippingIncrementalWeightOz are
    // 4oz/1oz (set in seedAuctionWinOrder's seedListing call): the first order added to the
    // session freezes the full base weight (4oz), every additional order only freezes the
    // incremental weight (1oz) — o1 + o2 = 5oz, not a sum of each listing's full parcelWeightOz.
    // Dimensions for frozen rows use frozenPriorPurchaseProfileRow's fixed small-parcel defaults
    // (6x4x1in), not the listing's parcelLengthIn/parcelWidthIn/parcelHeightIn either — those
    // legacy fields only drive the fallback path taken when a session has zero items at all,
    // which cannot happen once addOrderToLiveShippingSession has run (as it always has by the
    // time a real label purchase is attempted). The parcelWeightOz/dims args this test still
    // passes to seedAuctionWinOrder are therefore inert for this path; kept only because they're
    // harmless and document the seller-declared physical size on the listing itself.
    expect(createBody.parcels[0].weight).toBe("5");
    expect(createBody.parcels[0].length).toBe("6");
    expect(createBody.parcels[0].width).toBe("4");
    expect(createBody.parcels[0].height).toBe("1");

    const u1 = await prisma.order.findUnique({ where: { id: o1.id } });
    const u2 = await prisma.order.findUnique({ where: { id: o2.id } });
    expect(u1?.shippoTransactionId).toBe("tx_bundle_1");
    expect(u2?.shippoTransactionId).toBe("tx_bundle_1");
    expect(u1?.trackingNumber).toBe("1ZTRACKBUNDLE");
    expect(u2?.trackingNumber).toBe("1ZTRACKBUNDLE");
    // Full Shippo cost attributed to one debit order (not split across siblings).
    const costs = [u1?.shippingLabelCostCents ?? 0, u2?.shippingLabelCostCents ?? 0].sort((a, b) => b - a);
    expect(costs[0]).toBe(501);
    expect(costs[1]).toBe(0);
    const { chargeSellerForLabelCost } = await import("@/services/shipping/charge-seller-label-cost");
    expect(chargeSellerForLabelCost).toHaveBeenCalledTimes(1);
    expect(chargeSellerForLabelCost).toHaveBeenCalledWith(
      expect.objectContaining({ labelCostCents: 501, shippoTransactionId: "tx_bundle_1" }),
    );
  });

  it("durably ledgers a ShipmentLabelFinance row for the purchased package immediately, independent of the debit/clawback loop", async () => {
    const seller = await seedSellerStripeAndShipFrom(prisma, {
      email: "blb_ledger_s@test.internal",
      username: "blbledgerseller",
    });
    const buyer = await seedUser(prisma, { email: "blb_ledger_b@test.internal", username: "blbledgerbuyer" });
    const live = await prisma.liveRoom.create({
      data: { sellerId: seller.id, title: "Bundle ledger live", roomType: "auction", status: "live" },
    });
    const o1 = await seedAuctionWinOrder({ sellerId: seller.id, buyerId: buyer.id, liveRoomId: live.id });
    const { sessionId } = await addOrderToLiveShippingSession(o1.id);
    await prisma.order.updateMany({
      where: { id: o1.id },
      data: { paymentStatus: PAYMENT_PAID, status: "paid", shippingChargedCents: 500 },
    });

    // Fix #3 regression: even though `chargeSellerForLabelCost` is mocked out above (so the debit
    // loop below the purchase loop never touches the real ledger), the purchase loop itself must
    // still create exactly one durable ShipmentLabelFinance row the moment Shippo confirms SUCCESS.
    await generateBundledShippoLabelForSession(sessionId, seller.id);

    const financeRows = await prisma.shipmentLabelFinance.findMany({
      where: { shippoTransactionId: "tx_bundle_1" },
    });
    expect(financeRows).toHaveLength(1);
    expect(financeRows[0]).toMatchObject({
      orderId: o1.id,
      labelCostCents: 501,
      status: "active",
    });
  });

  it("mid-bundle crash: package 1's durable ledger row survives when package 2's Shippo purchase throws", async () => {
    const seller = await seedSellerStripeAndShipFrom(prisma, {
      email: "blb_crash_s@test.internal",
      username: "blbcrashseller",
    });
    const buyer = await seedUser(prisma, { email: "blb_crash_b@test.internal", username: "blbcrashbuyer" });
    const live = await prisma.liveRoom.create({
      data: { sellerId: seller.id, title: "Bundle crash live", roomType: "auction", status: "live" },
    });
    const o1 = await seedAuctionWinOrder({ sellerId: seller.id, buyerId: buyer.id, liveRoomId: live.id });
    const o2 = await seedAuctionWinOrder({ sellerId: seller.id, buyerId: buyer.id, liveRoomId: live.id });
    const { sessionId } = await addOrderToLiveShippingSession(o1.id);
    await addOrderToLiveShippingSession(o2.id);
    await prisma.order.updateMany({
      where: { id: { in: [o1.id, o2.id] } },
      data: { paymentStatus: PAYMENT_PAID, status: "paid", shippingChargedCents: 500 },
    });

    // Force each item into its own package group (no bundling) so the purchase loop below makes
    // two separate Shippo purchase attempts instead of one combined one.
    //
    // requiresSeparatePackage alone is NOT enough: buildSessionPackageGroups treats any session
    // item whose LiveShippingSessionItem.appliedWeightOz was already frozen by
    // addOrderToLiveShippingSession (both of these, immediately above) as a settled charge and
    // routes it through frozenPriorPurchaseProfileRow, which hardcodes bundleAllowed:true /
    // requiresSeparatePackage:false unconditionally — it never re-checks the LiveRoomItem at all.
    // Resetting appliedWeightOz back to 0 here is what makes buildSessionPackageGroups fall
    // through to the real per-item profile resolution branch that actually honors
    // requiresSeparatePackage. This models the one state that branch is written to handle (an
    // item that was added to a session but never had its weight priced/frozen) rather than
    // fabricating anything in production — see buildSessionPackageGroups in
    // live-shipping-quote.ts for the exact branch. Both items must be reset, not just one:
    // groupItemsIntoPackages nests a lone non-host item into whichever host has the largest
    // profile volume, so a single reset here would still collapse back into one package.
    await prisma.liveRoomItem.updateMany({
      where: { liveRoomId: live.id, listingId: { in: [o1.listingId, o2.listingId] } },
      data: { requiresSeparatePackage: true },
    });
    await prisma.liveShippingSessionItem.updateMany({
      where: { orderId: { in: [o1.id, o2.id] } },
      data: { appliedWeightOz: 0 },
    });

    shippoHoisted.create
      .mockResolvedValueOnce({ object_id: "ship_pkg1" })
      .mockResolvedValueOnce({ object_id: "ship_pkg2" });
    shippoHoisted.rates.mockResolvedValue({
      results: [{ object_id: "rate_cheap", amount: "5.01", provider: "USPS", servicelevel: { name: "Priority" } }],
    });
    shippoHoisted.purchase
      .mockResolvedValueOnce({
        object_id: "tx_pkg1",
        tracking_number: "1ZPKG1",
        tracking_url_provider: "https://track.example/pkg1",
        label_url: "https://label.example/pkg1.pdf",
        status: "SUCCESS",
      })
      .mockRejectedValueOnce(new Error("Shippo purchase failed for package 2"));

    await expect(generateBundledShippoLabelForSession(sessionId, seller.id)).rejects.toThrow(
      "Shippo purchase failed for package 2",
    );

    // Self-check: confirms the grouping above genuinely produced two separate purchase attempts
    // (two shipments created) rather than the default single combined package — otherwise this
    // test would trivially pass without exercising the mid-loop crash path at all.
    expect(shippoHoisted.create).toHaveBeenCalledTimes(2);
    expect(shippoHoisted.purchase).toHaveBeenCalledTimes(2);

    const pkg1Rows = await prisma.shipmentLabelFinance.findMany({ where: { shippoTransactionId: "tx_pkg1" } });
    expect(pkg1Rows).toHaveLength(1);
    expect(pkg1Rows[0]).toMatchObject({ labelCostCents: 501, status: "active" });

    // Package 2 never returned a transaction id — nothing to ledger, and definitely no row for
    // whatever partial/undefined state its failed purchase attempt left behind.
    const pkg2Rows = await prisma.shipmentLabelFinance.findMany({
      where: { orderId: { in: [o1.id, o2.id] }, NOT: { shippoTransactionId: "tx_pkg1" } },
    });
    expect(pkg2Rows).toHaveLength(0);

    // Not rolled back and not duplicated by the surrounding failure/catch handling.
    const allRowsForSession = await prisma.shipmentLabelFinance.findMany({
      where: { liveShippingSessionId: sessionId },
    });
    expect(allRowsForSession).toHaveLength(1);
  });

  it("returns existing label without calling Shippo when any order is already labeled", async () => {
    const seller = await seedSellerStripeAndShipFrom(prisma, {
      email: "blb2_s@test.internal",
      username: "blb2seller",
    });
    const buyer = await seedUser(prisma, { email: "blb2_b@test.internal", username: "blb2buyer" });
    const live = await prisma.liveRoom.create({
      data: { sellerId: seller.id, title: "L2", roomType: "auction", status: "live" },
    });
    const o1 = await seedAuctionWinOrder({ sellerId: seller.id, buyerId: buyer.id, liveRoomId: live.id });
    const o2 = await seedAuctionWinOrder({ sellerId: seller.id, buyerId: buyer.id, liveRoomId: live.id });
    const { sessionId } = await addOrderToLiveShippingSession(o1.id);
    await addOrderToLiveShippingSession(o2.id);
    await prisma.order.updateMany({
      where: { id: { in: [o1.id, o2.id] } },
      data: { paymentStatus: PAYMENT_PAID, status: "paid" },
    });
    await prisma.order.update({
      where: { id: o1.id },
      data: {
        shippoTransactionId: "tx_existing",
        labelUrl: "https://old.label",
        trackingNumber: "1ZOLD",
        shippingLabelCostCents: 400,
      },
    });

    const result = await generateBundledShippoLabelForSession(sessionId, seller.id);
    expect(result.alreadyExisted).toBe(true);
    expect(result.shippoTransactionId).toBe("tx_existing");
    expect(shippoHoisted.create).not.toHaveBeenCalled();
  });

  it("rejects ship-alone (per-order) sessions", async () => {
    const seller = await seedSellerStripeAndShipFrom(prisma, {
      email: "blb3_s@test.internal",
      username: "blb3seller",
    });
    const buyer = await seedUser(prisma, { email: "blb3_b@test.internal", username: "blb3buyer" });
    const live = await prisma.liveRoom.create({
      data: { sellerId: seller.id, title: "L3", roomType: "auction", status: "live" },
    });
    const o1 = await seedAuctionWinOrder({ sellerId: seller.id, buyerId: buyer.id, liveRoomId: live.id, shipAlone: true });
    const { sessionId } = await addOrderToLiveShippingSession(o1.id);
    await prisma.order.update({
      where: { id: o1.id },
      data: { paymentStatus: PAYMENT_PAID, status: "paid" },
    });

    await expect(generateBundledShippoLabelForSession(sessionId, seller.id)).rejects.toThrow("NOT_A_COMBINED_BUNDLE_SESSION");
  });

  it("excludes unpaid orders from the bundle label", async () => {
    const seller = await seedSellerStripeAndShipFrom(prisma, {
      email: "blb4_s@test.internal",
      username: "blb4seller",
    });
    const buyer = await seedUser(prisma, { email: "blb4_b@test.internal", username: "blb4buyer" });
    const live = await prisma.liveRoom.create({
      data: { sellerId: seller.id, title: "L4", roomType: "auction", status: "live" },
    });
    const o1 = await seedAuctionWinOrder({ sellerId: seller.id, buyerId: buyer.id, liveRoomId: live.id });
    const o2 = await seedAuctionWinOrder({ sellerId: seller.id, buyerId: buyer.id, liveRoomId: live.id });
    const { sessionId } = await addOrderToLiveShippingSession(o1.id);
    await addOrderToLiveShippingSession(o2.id);
    await prisma.order.update({ where: { id: o1.id }, data: { paymentStatus: PAYMENT_PAID, status: "paid" } });

    await generateBundledShippoLabelForSession(sessionId, seller.id);

    const u1 = await prisma.order.findUnique({ where: { id: o1.id } });
    const u2 = await prisma.order.findUnique({ where: { id: o2.id } });
    expect(u1?.shippoTransactionId).toBe("tx_bundle_1");
    expect(u2?.shippoTransactionId).toBeNull();
  });
});
