export type StripeKeyMode = "test" | "live" | "unknown";

/** Infer Stripe test vs live mode from a key prefix without logging the key. */
export function stripeKeyMode(key: string | undefined | null): StripeKeyMode {
  const k = key?.trim() ?? "";
  if (!k) return "unknown";
  if (k.startsWith("pk_live_") || k.startsWith("sk_live_") || k.startsWith("rk_live_")) return "live";
  if (k.startsWith("pk_test_") || k.startsWith("sk_test_") || k.startsWith("rk_test_")) return "test";
  return "unknown";
}

export function stripeKeysAligned(
  publishableMode: StripeKeyMode,
  secretMode: StripeKeyMode,
): boolean | null {
  if (publishableMode === "unknown" || secretMode === "unknown") return null;
  return publishableMode === secretMode;
}
