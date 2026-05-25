import { EXPECTED_BETA_PROJECT_REF } from "@/lib/beta-qa-scope";
import { supabaseProjectRefFromUrl } from "@/lib/resolve-database-url";

/** True when this deploy targets the beta Supabase project (xkaaicokjgmpbctfermj). */
export function isBetaDeployment(): boolean {
  const candidates = [
    process.env.SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.DATABASE_URL,
  ];
  for (const raw of candidates) {
    const url = raw?.trim();
    if (!url) continue;
    if (supabaseProjectRefFromUrl(url) === EXPECTED_BETA_PROJECT_REF) return true;
  }
  return false;
}

export function isWebSignupResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export type WebSignupVerificationMethod = "resend_code" | "supabase_link" | "unavailable";

/** How web `/api/register` verifies new accounts on this deploy. */
export function webSignupVerificationMethod(): WebSignupVerificationMethod {
  if (isBetaDeployment()) return "supabase_link";
  if (isWebSignupResendConfigured()) return "resend_code";
  return "unavailable";
}
