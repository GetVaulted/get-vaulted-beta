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
    expect(d.stripeConnectWebhookSecretConfigured).toBe(false);
    expect(d.resendEmailReady).toBe(true);
    expect(JSON.stringify(d)).not.toContain("sk_live_");
    expect(JSON.stringify(d)).not.toContain("whsec_");
    expect(JSON.stringify(d)).not.toContain("re_live_key");
  });

  it("reports connect webhook secret when configured", () => {
    vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "whsec_connect_only");

    const d = buildDeploymentConfigDiagnostics();

    expect(d.stripeConnectWebhookSecretConfigured).toBe(true);
    expect(JSON.stringify(d)).not.toContain("whsec_connect");
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

  it("reports Sentry booleans without ever exposing the DSN or auth token", () => {
    vi.stubEnv("SENTRY_DSN", "https://examplekey@o0.ingest.sentry.io/123");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://examplekey@o0.ingest.sentry.io/456");
    vi.stubEnv("SENTRY_ORG", "get-vaulted");
    vi.stubEnv("SENTRY_PROJECT", "web");
    vi.stubEnv("SENTRY_AUTH_TOKEN", "sntrys_super_secret_token");

    const d = buildDeploymentConfigDiagnostics();

    expect(d.sentryServerConfigured).toBe(true);
    expect(d.sentryClientConfigured).toBe(true);
    expect(d.sentrySourceMapsConfigured).toBe(true);
    expect(JSON.stringify(d)).not.toContain("examplekey");
    expect(JSON.stringify(d)).not.toContain("sntrys_super_secret_token");
  });

  it("reports Sentry as unconfigured when DSNs and auth token are unset", () => {
    const d = buildDeploymentConfigDiagnostics();

    expect(d.sentryServerConfigured).toBe(false);
    expect(d.sentryClientConfigured).toBe(false);
    expect(d.sentrySourceMapsConfigured).toBe(false);
  });

  it("flags source maps as not configured when only some of org/project/token are set", () => {
    vi.stubEnv("SENTRY_ORG", "get-vaulted");
    vi.stubEnv("SENTRY_PROJECT", "web");
    // SENTRY_AUTH_TOKEN intentionally left unset.

    const d = buildDeploymentConfigDiagnostics();

    expect(d.sentrySourceMapsConfigured).toBe(false);
  });
});
