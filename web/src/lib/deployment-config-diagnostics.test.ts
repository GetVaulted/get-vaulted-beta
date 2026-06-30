import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDeploymentConfigDiagnostics } from "@/lib/deployment-config-diagnostics";

describe("buildDeploymentConfigDiagnostics", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports live Stripe readiness without exposing secret keys", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://shopgetvaulted.com");
    vi.stubEnv("NEXTAUTH_URL", "https://shopgetvaulted.com");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://xkaaicokjgmpbctfermj.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_123456789012345678901234");
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_live_123456789012345678901234");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_live_secret_value_here");
    vi.stubEnv("RESEND_API_KEY", "re_live_key");
    vi.stubEnv("RESEND_FROM", "Get Vaulted <hello@shopgetvaulted.com>");

    const d = buildDeploymentConfigDiagnostics();

    expect(d.appUrl).toBe("https://shopgetvaulted.com");
    expect(d.stripeMode).toBe("live");
    expect(d.stripeSecretKeyMode).toBe("live");
    expect(d.stripeKeysAligned).toBe(true);
    expect(d.stripeProductionReady).toBe(true);
    expect(d.resendEmailReady).toBe(true);
    expect(JSON.stringify(d)).not.toContain("sk_live_");
    expect(JSON.stringify(d)).not.toContain("whsec_");
    expect(JSON.stringify(d)).not.toContain("re_live_key");
  });

  it("flags test Stripe keys on production URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://shopgetvaulted.com");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://xkaaicokjgmpbctfermj.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_12345678901");
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_test_12345678901");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");

    const d = buildDeploymentConfigDiagnostics();

    expect(d.stripeMode).toBe("test");
    expect(d.stripeSecretKeyMode).toBe("test");
    expect(d.stripeProductionReady).toBe(false);
  });
});
