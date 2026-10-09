import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  resolveLiveRoomsUserId: vi.fn(),
  liveRoomPaymentBlockResponse: vi.fn().mockResolvedValue(null),
  getLiveRoomBroadcastCommerceBlock: vi.fn().mockReturnValue(null),
  getLiveBuyerCommerceBlock: vi.fn().mockResolvedValue(null),
  isStripeConfigured: vi.fn().mockReturnValue(false),
  isRandomVariantAssignment: vi.fn().mockReturnValue(false),
  remainingRandomPoolCount: vi.fn().mockResolvedValue(32),
  finalizeLiveItemVariantPurchasePaid: vi.fn().mockResolvedValue(undefined),
  releaseVariantPurchaseOnCheckoutExpired: vi.fn().mockResolvedValue(undefined),
  reopenVariantPurchaseForRecovery: vi.fn(),
  settleLiveItemVariantPurchase: vi.fn(),
  syncLiveItemVariantPurchasePaymentIntent: vi.fn(),
  getLiveBuyerPaymentSessionState: vi.fn(),
  emitLiveRoomQueueItemsChanged: vi.fn(),
  liveWalletIncompleteOrNull: vi.fn().mockResolvedValue(null),
  resolveBuyerDefaultShippingForOrder: vi.fn().mockResolvedValue({}),
  isBetaDeployment: vi.fn().mockReturnValue(false),
  assertRandomPurchaseAllowedInTx: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/resolve-live-rooms-auth", () => ({ resolveLiveRoomsUserId: hoisted.resolveLiveRoomsUserId }));
vi.mock("@/lib/live-room-payment-failure", () => ({
  liveRoomPaymentBlockResponse: hoisted.liveRoomPaymentBlockResponse,
  getUnresolvedPaymentFailureForBuyer: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/live-room-commerce-guards", () => ({
  getLiveRoomBroadcastCommerceBlock: hoisted.getLiveRoomBroadcastCommerceBlock,
  getLiveBuyerCommerceBlock: hoisted.getLiveBuyerCommerceBlock,
  isLiveRoomOpenForSpotPurchase: vi.fn().mockReturnValue(true),
}));
vi.mock("@/lib/live-sweet16-draft", () => ({ assertSweet16CapacityInTx: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/stripe", () => ({ isStripeConfigured: hoisted.isStripeConfigured }));
vi.mock("@/lib/live-item-variant-presets", () => ({ isVariantSalesFormat: vi.fn().mockReturnValue(true) }));
vi.mock("@/lib/live-item-variant-random-reveal", () => ({
  isRandomVariantAssignment: hoisted.isRandomVariantAssignment,
  remainingRandomPoolCount: hoisted.remainingRandomPoolCount,
}));
vi.mock("@/lib/live-item-variant-purchase", () => ({
  finalizeLiveItemVariantPurchasePaid: hoisted.finalizeLiveItemVariantPurchasePaid,
  releaseVariantPurchaseOnCheckoutExpired: hoisted.releaseVariantPurchaseOnCheckoutExpired,
  reopenVariantPurchaseForRecovery: hoisted.reopenVariantPurchaseForRecovery,
}));
vi.mock("@/lib/live-payment-pipeline", () => ({
  getLiveBuyerPaymentSessionState: hoisted.getLiveBuyerPaymentSessionState,
  settleLiveItemVariantPurchase: hoisted.settleLiveItemVariantPurchase,
  syncLiveItemVariantPurchasePaymentIntent: hoisted.syncLiveItemVariantPurchasePaymentIntent,
}));
vi.mock("@/lib/realtime-emit-server", () => ({
  emitLiveRoomQueueItemsChanged: hoisted.emitLiveRoomQueueItemsChanged,
}));
vi.mock("@/lib/buyer-live-wallet-readiness", () => ({
  liveWalletIncompleteOrNull: hoisted.liveWalletIncompleteOrNull,
}));
vi.mock("@/lib/live-buy-now-purchase", () => ({
  resolveBuyerDefaultShippingForOrder: hoisted.resolveBuyerDefaultShippingForOrder,
}));
vi.mock("@/lib/is-beta-deployment", () => ({ isBetaDeployment: hoisted.isBetaDeployment }));
vi.mock("@/lib/trust/live-room-moderation", () => ({
  getLiveRoomUserRestrictions: vi.fn().mockResolvedValue({ roomBanned: false, kickedUntil: null }),
}));
vi.mock("@/lib/random-purchase-guard", async () => {
  const actual = await vi.importActual<typeof import("@/lib/random-purchase-guard")>("@/lib/random-purchase-guard");
  return { ...actual, assertRandomPurchaseAllowedInTx: hoisted.assertRandomPurchaseAllowedInTx };
});

function variantRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "variant_1",
    priceUsd: 25,
    liveRoomItem: {
      id: "item_1",
      status: "active",
      salesFormat: "team_break",
      title: "Mystery box",
      biddingOpen: false,
      auctionVariantId: null,
      variantAssignmentMode: "random",
      ...((overrides.liveRoomItem as Record<string, unknown>) ?? {}),
    },
    ...overrides,
  };
}

const prismaMock = vi.hoisted(() => ({
  liveRoom: {
    findUnique: vi.fn(),
  },
  liveItemVariantPurchase: {
    findFirst: vi.fn().mockResolvedValue(null),
  },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { POST } from "@/app/api/live-rooms/[id]/items/[itemId]/variants/[variantId]/purchase/route";

function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    liveItemVariant: {
      findFirst: vi.fn().mockResolvedValue(variantRow()),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn().mockResolvedValue({ quantityRemaining: 5 }),
      update: vi.fn().mockResolvedValue(undefined),
    },
    liveItemVariantPurchase: {
      create: vi.fn().mockResolvedValue({ id: "purchase_1", totalUsd: 25 }),
    },
    liveRoomItem: {
      update: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

function postRequest(body: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return new Request("http://x/api/live-rooms/room_1/items/item_1/variants/variant_1/purchase", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function postParams() {
  return { params: Promise.resolve({ id: "room_1", itemId: "item_1", variantId: "variant_1" }) };
}

describe("variant purchase route — random-reveal validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.resolveLiveRoomsUserId.mockResolvedValue({ userId: "buyer_1" });
    hoisted.liveRoomPaymentBlockResponse.mockResolvedValue(null);
    hoisted.getLiveRoomBroadcastCommerceBlock.mockReturnValue(null);
    hoisted.getLiveBuyerCommerceBlock.mockResolvedValue(null);
    hoisted.isStripeConfigured.mockReturnValue(false);
    hoisted.isRandomVariantAssignment.mockReturnValue(true);
    hoisted.remainingRandomPoolCount.mockResolvedValue(32);
    hoisted.finalizeLiveItemVariantPurchasePaid.mockResolvedValue(undefined);
    hoisted.assertRandomPurchaseAllowedInTx.mockResolvedValue(undefined);
    prismaMock.liveRoom.findUnique.mockResolvedValue({
      id: "room_1",
      sellerId: "seller_1",
      status: "live",
      lockPurchases: false,
      streamHealth: "live",
      streamPaused: false,
      streamMode: "stage_webrtc",
      streamStartedAt: new Date(),
      streamEndedAt: null,
    });
    prismaMock.liveItemVariantPurchase.findFirst.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(makeTx()));
  });

  it("FIX 2: rejects quantity > 1 for a random-reveal variant", async () => {
    const res = await POST(postRequest({ quantity: 3 }), postParams());
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("RANDOM_REVEAL_QUANTITY_LIMIT");
  });

  it("FIX 2: allows quantity === 1 for a random-reveal variant", async () => {
    const res = await POST(postRequest({ quantity: 1 }), postParams());
    expect(res.status).toBe(200);
  });

  it("FIX 2: does not gate quantity for non-random-reveal (pick) variants", async () => {
    hoisted.isRandomVariantAssignment.mockReturnValue(false);
    const res = await POST(postRequest({ quantity: 5 }), postParams());
    expect(res.status).toBe(200);
  });

  it("FIX 3: rejects a purchase once the random-reveal pool is fully claimed, even with inventory left", async () => {
    hoisted.remainingRandomPoolCount.mockResolvedValue(0);
    const res = await POST(postRequest({ quantity: 1 }), postParams());
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("RANDOM_REVEAL_POOL_EXHAUSTED");
  });

  it("FIX 3: allows the purchase when pool labels remain", async () => {
    hoisted.remainingRandomPoolCount.mockResolvedValue(1);
    const res = await POST(postRequest({ quantity: 1 }), postParams());
    expect(res.status).toBe(200);
  });

  it("requires the 18+ confirmation before a random-reveal purchase", async () => {
    hoisted.assertRandomPurchaseAllowedInTx.mockRejectedValue(
      Object.assign(new Error("Confirm you are 18 or older to buy a random reveal."), {
        code: "ADULT_CONFIRMATION_REQUIRED",
      }),
    );
    const res = await POST(postRequest({ quantity: 1 }), postParams());
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("ADULT_CONFIRMATION_REQUIRED");
  });

  it("returns 429 with a retry time when the buyer hits the random purchase limit", async () => {
    hoisted.assertRandomPurchaseAllowedInTx.mockRejectedValue(
      Object.assign(new Error("Take a short break."), {
        code: "RANDOM_PURCHASE_COOLING_OFF",
        retryAt: new Date("2026-10-09T12:15:00Z"),
      }),
    );
    const res = await POST(postRequest({ quantity: 1 }), postParams());
    expect(res.status).toBe(429);
    const body = (await res.json()) as { code?: string; retryAt?: string };
    expect(body.code).toBe("RANDOM_PURCHASE_COOLING_OFF");
    expect(body.retryAt).toBe("2026-10-09T12:15:00.000Z");
  });

  it("does not run the 18+ / limit check for pick (non-random) variants", async () => {
    hoisted.isRandomVariantAssignment.mockReturnValue(false);
    await POST(postRequest({ quantity: 1 }), postParams());
    expect(hoisted.assertRandomPurchaseAllowedInTx).not.toHaveBeenCalled();
  });
});
