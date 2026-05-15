import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/escrow-config", () => ({
  ESCROW_THRESHOLD_USD: 5000,
  isEscrowFeaturesEnabled: () => true,
  configuredEscrowProviderId: () => "other_provider" as never,
  isEscrowConfigured: () => true,
  orderTotalQualifiesForEscrow: (n: number) => n >= 5000,
  estimateEscrowFeeCents: () => 100,
  escrowAutoReleaseAfterDeliveryMs: () => null,
}));

describe("getEscrowProvider", () => {
  it(
    "throws when the configured provider id is not implemented",
    async () => {
      const { getEscrowProvider } = await import("@/services/escrow/factory");
      expect(() => getEscrowProvider()).toThrow("ESCROW_PROVIDER_UNSUPPORTED");
    },
    15_000,
  );
});
