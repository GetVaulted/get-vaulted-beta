import { beforeEach, describe, expect, it, vi } from "vitest";
import { EscrowStatus } from "@/generated/prisma/enums";

vi.mock("@/lib/escrow-audit-log", () => ({ logEscrowStatusTransition: vi.fn().mockResolvedValue(undefined) }));

const releaseFunds = vi.hoisted(() => vi.fn());
vi.mock("@/services/escrow/factory", () => ({ getEscrowProvider: () => ({ releaseFunds }) }));

const prismaMock = vi.hoisted(() => ({
  order: {
    updateMany: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  EscrowReleaseAlreadyInFlightError,
  releaseEscrowFundsFromApproved,
} from "@/services/escrow/release-when-approved";

const order = {
  id: "ord_1",
  sellerId: "seller_1",
  listingId: "lst_1",
  escrowTransactionId: "trust_txn_1",
  escrowProvider: "trustap",
};

describe("releaseEscrowFundsFromApproved concurrency guard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("claims the release atomically before calling the escrow provider", async () => {
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
    releaseFunds.mockResolvedValue({ escrowStatus: EscrowStatus.funds_released });

    await releaseEscrowFundsFromApproved({ order, auditSource: "buyer" });

    expect(prismaMock.order.updateMany).toHaveBeenCalledWith({
      where: { id: "ord_1", escrowStatus: EscrowStatus.approved, escrowReleaseInFlight: false },
      data: { escrowReleaseInFlight: true },
    });
    const claimCallOrder = prismaMock.order.updateMany.mock.invocationCallOrder[0];
    const providerCallOrder = releaseFunds.mock.invocationCallOrder[0];
    expect(claimCallOrder).toBeLessThan(providerCallOrder);
  });

  it("throws without calling the provider when a concurrent caller already holds the claim", async () => {
    prismaMock.order.updateMany.mockResolvedValue({ count: 0 });

    await expect(releaseEscrowFundsFromApproved({ order, auditSource: "system" })).rejects.toBeInstanceOf(
      EscrowReleaseAlreadyInFlightError,
    );

    expect(releaseFunds).not.toHaveBeenCalled();
  });

  it("clears the in-flight flag and rethrows when the provider call fails", async () => {
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
    releaseFunds.mockRejectedValue(new Error("provider down"));

    await expect(releaseEscrowFundsFromApproved({ order, auditSource: "admin" })).rejects.toThrow("provider down");

    expect(prismaMock.order.update).toHaveBeenCalledWith({
      where: { id: "ord_1" },
      data: { escrowReleaseInFlight: false },
    });
  });

  it("clears the in-flight flag and marks funds_released on a successful release", async () => {
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
    releaseFunds.mockResolvedValue({ escrowStatus: EscrowStatus.funds_released });

    const result = await releaseEscrowFundsFromApproved({ order, auditSource: "buyer" });

    expect(result.escrowStatus).toBe(EscrowStatus.funds_released);
    expect(prismaMock.order.update).toHaveBeenCalledWith({
      where: { id: "ord_1" },
      data: expect.objectContaining({
        escrowStatus: EscrowStatus.funds_released,
        escrowReleaseInFlight: false,
      }),
    });
  });
});
