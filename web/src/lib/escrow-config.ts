/** USD threshold: at or above this, marketplace checkout may use the optional high-value alternate path (only when `ESCROW_ENABLED=true`). */
export const ESCROW_THRESHOLD_USD = 5000;

/**
 * Opt-in for Trustap / high-value escrow. MVP default is off (Stripe-only marketplace).
 * Set `ESCROW_ENABLED=true` plus Trustap env vars to re-enable.
 */
export function isEscrowFeaturesEnabled(): boolean {
  return process.env.ESCROW_ENABLED?.trim().toLowerCase() === "true";
}

/**
 * Estimated buyer-facing fee for optional high-value checkout path (USD cents).
 * Replace with provider quote API when escrow is re-enabled.
 */
export function estimateEscrowFeeCents(totalUsd: number): number {
  const subtotalCents = Math.round(totalUsd * 100);
  const bps = Number.parseInt(process.env.ESCROW_FEE_BPS ?? "100", 10);
  const rate = Number.isFinite(bps) && bps >= 0 ? bps / 10_000 : 0.01;
  const pct = Math.round(subtotalCents * rate);
  const minCents = Number.parseInt(process.env.ESCROW_FEE_MIN_CENTS ?? "2500", 10);
  const floor = Number.isFinite(minCents) && minCents >= 0 ? minCents : 2500;
  return Math.max(floor, pct);
}

/**
 * Auto-release funds N ms after delivery if buyer does not act.
 * TODO: wire a scheduled job / queue consumer; read this env there.
 */
export function escrowAutoReleaseAfterDeliveryMs(): number | null {
  const raw = process.env.ESCROW_AUTO_RELEASE_AFTER_DELIVERY_MS;
  if (raw == null || raw === "") return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type EscrowProviderId = "trustap";

export function configuredEscrowProviderId(): EscrowProviderId | null {
  const id = (process.env.ESCROW_PROVIDER ?? "").trim().toLowerCase();
  if (id === "trustap") return "trustap";
  return null;
}

export function isEscrowConfigured(): boolean {
  if (!configuredEscrowProviderId()) return false;
  const key = process.env.TRUSTAP_API_KEY?.trim();
  const base = process.env.TRUSTAP_API_BASE_URL?.trim();
  return Boolean(key && base);
}

export function orderTotalQualifiesForEscrow(totalUsd: number): boolean {
  if (!isEscrowFeaturesEnabled()) return false;
  return totalUsd >= ESCROW_THRESHOLD_USD;
}
