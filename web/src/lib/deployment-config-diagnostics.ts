import { isAppleOAuthProviderEnabled, isGoogleOAuthProviderEnabled } from "@/lib/auth-provider-availability";
import { EXPECTED_BETA_PROJECT_REF } from "@/lib/beta-qa-scope";
import {
  isBetaDeployment,
  isWebSignupResendConfigured,
  webSignupVerificationMethod,
  type WebSignupVerificationMethod,
} from "@/lib/is-beta-deployment";
import { supabaseProjectRefFromUrl } from "@/lib/resolve-database-url";
import { getStripePublishableKey, isStripeConfigured } from "@/lib/stripe";
import { stripeKeyMode, stripeKeysAligned } from "@/lib/stripe-key-mode";

export type DeploymentConfigDiagnostics = {
  appUrl: string | null;
  projectRef: string | null;
  expectedBetaProjectRef: string;
  alignedWithBeta: boolean;
  supabaseUrlConfigured: boolean;
  supabaseAnonKeyConfigured: boolean;
  webSignInSupportsSupabaseAuth: boolean;
  webSignupAvailable: boolean;
  webSignupVerificationMethod: WebSignupVerificationMethod;
  webSignupResendConfigured: boolean;
  resendFromConfigured: boolean;
  nextAuthUrlConfigured: boolean;
  nextAuthUrl: string | null;
  oauthProviders: {
    google: boolean;
    apple: boolean;
  };
  stripeConfigured: boolean;
  /** Publishable key mode (`pk_test_` vs `pk_live_`). */
  stripeMode: ReturnType<typeof stripeKeyMode>;
  /** Secret key mode (`sk_test_` vs `sk_live_`) — mode only, key never exposed. */
  stripeSecretKeyMode: ReturnType<typeof stripeKeyMode>;
  stripeKeysAligned: boolean | null;
  stripeWebhookSecretConfigured: boolean;
  /** Connect destination signing secret (get-vaulted-connect) — optional second webhook. */
  stripeConnectWebhookSecretConfigured: boolean;
  /** True when Stripe is live-mode with matching keys and webhook secret set. */
  stripeProductionReady: boolean;
  /** Resend OTP path + resend-verification API. Supabase-link signup uses Supabase email instead. */
  resendEmailReady: boolean;
  /** Client Stripe.js / mobile wallet needs the publishable key (safe to expose). */
  stripePublishableKey: string | null;
  usesSupabaseAuthSignup: boolean;
  /** Server/edge Sentry init (SENTRY_DSN) — booleans only, DSN itself is never exposed. */
  sentryServerConfigured: boolean;
  /** Browser Sentry init (NEXT_PUBLIC_SENTRY_DSN). */
  sentryClientConfigured: boolean;
  /** Source-map upload during build (SENTRY_ORG + SENTRY_PROJECT + SENTRY_AUTH_TOKEN). */
  sentrySourceMapsConfigured: boolean;
};

function resolvePublicAppUrl(): string | null {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.STRIPE_CONNECT_PUBLIC_APP_URL?.trim() ||
    "";
  return raw ? raw.replace(/\/+$/, "") : null;
}

export function buildDeploymentConfigDiagnostics(): DeploymentConfigDiagnostics {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? process.env.SUPABASE_URL?.trim() ?? "";
  const anonConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? process.env.SUPABASE_ANON_KEY?.trim(),
  );
  const projectRef = url ? supabaseProjectRefFromUrl(url) : null;
  const verificationMethod = webSignupVerificationMethod();
  const nextAuthUrl = process.env.NEXTAUTH_URL?.trim() || null;
  const resendConfigured = isWebSignupResendConfigured();
  const resendFromConfigured = Boolean(process.env.RESEND_FROM?.trim());
  const stripeConfigured = isStripeConfigured();
  const publishableKey = stripeConfigured ? getStripePublishableKey().trim() : "";
  const publishableMode = stripeKeyMode(publishableKey);
  const secretMode = stripeKeyMode(process.env.STRIPE_SECRET_KEY);
  const keysAligned = stripeKeysAligned(publishableMode, secretMode);
  const webhookConfigured = Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim());
  const connectWebhookConfigured = Boolean(process.env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim());
  const stripeProductionReady =
    stripeConfigured &&
    publishableMode === "live" &&
    secretMode === "live" &&
    keysAligned === true &&
    webhookConfigured;

  return {
    appUrl: resolvePublicAppUrl(),
    projectRef,
    expectedBetaProjectRef: EXPECTED_BETA_PROJECT_REF,
    alignedWithBeta: projectRef === EXPECTED_BETA_PROJECT_REF,
    supabaseUrlConfigured: Boolean(url),
    supabaseAnonKeyConfigured: anonConfigured,
    webSignInSupportsSupabaseAuth: anonConfigured && Boolean(url),
    webSignupAvailable: verificationMethod !== "unavailable",
    webSignupVerificationMethod: verificationMethod,
    webSignupResendConfigured: resendConfigured,
    resendFromConfigured,
    nextAuthUrlConfigured: Boolean(nextAuthUrl),
    nextAuthUrl,
    oauthProviders: {
      google: isGoogleOAuthProviderEnabled(),
      apple: isAppleOAuthProviderEnabled(),
    },
    stripeConfigured,
    stripeMode: publishableMode,
    stripeSecretKeyMode: secretMode,
    stripeKeysAligned: keysAligned,
    stripeWebhookSecretConfigured: webhookConfigured,
    stripeConnectWebhookSecretConfigured: connectWebhookConfigured,
    stripeProductionReady,
    resendEmailReady: resendConfigured && resendFromConfigured,
    stripePublishableKey: publishableKey || null,
    usesSupabaseAuthSignup: isBetaDeployment(),
    sentryServerConfigured: Boolean(process.env.SENTRY_DSN?.trim()),
    sentryClientConfigured: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()),
    sentrySourceMapsConfigured: Boolean(
      process.env.SENTRY_ORG?.trim() &&
        process.env.SENTRY_PROJECT?.trim() &&
        process.env.SENTRY_AUTH_TOKEN?.trim(),
    ),
  };
}
