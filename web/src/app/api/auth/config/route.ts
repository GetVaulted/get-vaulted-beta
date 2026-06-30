import { NextResponse } from "next/server";
import { buildDeploymentConfigDiagnostics } from "@/lib/deployment-config-diagnostics";

/**
 * Public read-only deployment diagnostics.
 * Does not expose secret keys (sk_, whsec_, re_). Compare `projectRef` to mobile `EXPO_PUBLIC_SUPABASE_URL`.
 * `stripePublishableKey` is included for client Stripe.js / mobile wallet (publishable only).
 */
export async function GET() {
  return NextResponse.json(buildDeploymentConfigDiagnostics());
}
