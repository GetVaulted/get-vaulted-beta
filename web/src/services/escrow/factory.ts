import { createRequire } from "node:module";
import { configuredEscrowProviderId, isEscrowConfigured } from "@/lib/escrow-config";
import type { EscrowProvider } from "@/services/escrow/types";

const require = createRequire(import.meta.url);

export function getEscrowProvider(): EscrowProvider {
  if (!isEscrowConfigured()) {
    throw new Error("ESCROW_NOT_CONFIGURED");
  }
  const id = configuredEscrowProviderId();
  if (id === "trustap") {
    const { TrustapEscrowProvider } = require("./trustap-provider") as typeof import("./trustap-provider");
    return new TrustapEscrowProvider();
  }
  throw new Error("ESCROW_PROVIDER_UNSUPPORTED");
}
