import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    taxNexusState: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { resolveTaxCollectionForDestination, TAX_COLLECTION_BASIS } from "@/lib/sales-tax-jurisdiction";

describe("resolveTaxCollectionForDestination", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_jurisdiction_key_12345");
    vi.stubEnv("STRIPE_TAX_ENABLED", "1");
    vi.mocked(prisma.taxNexusState.findUnique).mockReset();
  });

  it("collects for TX buyer when TX is enabled (out-of-state seller irrelevant)", async () => {
    vi.mocked(prisma.taxNexusState.findUnique).mockResolvedValue({
      enabled: true,
      collectionBasis: "marketplace_facilitator",
    } as never);

    const decision = await resolveTaxCollectionForDestination({ shipState: "TX", shipCountry: "US" });
    expect(decision.collect).toBe(true);
    expect(decision.stateCode).toBe("TX");
    expect(decision.collectionBasis).toBe(TAX_COLLECTION_BASIS.marketplace_facilitator);
  });

  it("does not collect for CA buyer when CA is disabled", async () => {
    vi.mocked(prisma.taxNexusState.findUnique).mockResolvedValue({
      enabled: false,
      collectionBasis: "marketplace_facilitator",
    } as never);

    const decision = await resolveTaxCollectionForDestination({ shipState: "CA", shipCountry: "US" });
    expect(decision.collect).toBe(false);
    expect(decision.stateCode).toBe("CA");
  });

  it("does not collect for TX seller shipping out of state (buyer in FL)", async () => {
    vi.mocked(prisma.taxNexusState.findUnique).mockResolvedValue({
      enabled: false,
      collectionBasis: "marketplace_facilitator",
    } as never);

    const decision = await resolveTaxCollectionForDestination({ shipState: "FL", shipCountry: "US" });
    expect(decision.collect).toBe(false);
  });

  it("does not collect for non-US destinations", async () => {
    const decision = await resolveTaxCollectionForDestination({ shipState: "TX", shipCountry: "CA" });
    expect(decision.collect).toBe(false);
    expect(prisma.taxNexusState.findUnique).not.toHaveBeenCalled();
  });
});
