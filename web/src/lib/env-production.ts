/**
 * When `ESCROW_ENABLED=true`, Trustap stub mode must never run in production — it bypasses real API calls.
 * If escrow features are off (MVP default), stub mode is ignored so the app boots without Trustap.
 */
export function assertTrustapStubForbiddenInProduction(context?: string): void {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.ESCROW_ENABLED?.trim().toLowerCase() !== "true") return;
  if (process.env.TRUSTAP_USE_STUB_RESPONSE !== "1") return;

  const prefix = context ? `${context} ` : "";
  throw new Error(
    `${prefix}TRUSTAP_USE_STUB_RESPONSE=1 is forbidden when NODE_ENV=production and ESCROW_ENABLED=true. ` +
      "Set TRUSTAP_USE_STUB_RESPONSE=0 (or unset) for live Trustap.",
  );
}

/**
 * Validates env vars required for a safe production deployment.
 * Called from `instrumentation.ts` when the Node server boots (`next start`).
 */
export function assertProductionServerEnv(): void {
  if (process.env.NODE_ENV !== "production") return;

  assertTrustapStubForbiddenInProduction("Server startup:");

  const missing: string[] = [];
  if (!process.env.DATABASE_URL?.trim()) missing.push("DATABASE_URL");
  if (!process.env.NEXTAUTH_SECRET?.trim()) missing.push("NEXTAUTH_SECRET");
  if (!process.env.NEXTAUTH_URL?.trim()) missing.push("NEXTAUTH_URL");
  if (!process.env.SUPABASE_URL?.trim()) missing.push("SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) missing.push("SUPABASE_SERVICE_ROLE_KEY");

  if (missing.length === 0) return;

  throw new Error(
    `Get Vaulted cannot start in production without: ${missing.join(", ")}. ` +
      "Copy `.env.example` to `.env`, set values, and see README.md → Environment variables.",
  );
}
