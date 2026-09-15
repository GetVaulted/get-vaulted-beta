# Production launch configuration — shopgetvaulted.com

Checklist for moving **live commerce** and **auth email** from test/incomplete config to production-ready settings on the Netlify site that serves `shopgetvaulted.com`.

Supabase project ref (`xkaaicokjgmpbctfermj`) is **correct** and shared with beta/mobile — do not change Supabase keys or OAuth unless a separate issue is confirmed.

---

## Quick verify

After deploy:

```bash
cd web
npm run check:production-deployment
```

Or manually:

```powershell
Invoke-RestMethod -Uri "https://shopgetvaulted.com/api/auth/config" | ConvertTo-Json -Depth 5
```

Expected when launch-ready:

| Field | Expected |
|-------|----------|
| `projectRef` | `xkaaicokjgmpbctfermj` |
| `alignedWithBeta` | `true` |
| `nextAuthUrl` | `https://shopgetvaulted.com` |
| `oauthProviders.google` / `.apple` | `true` |
| `stripeMode` | `live` |
| `stripeSecretKeyMode` | `live` |
| `stripeKeysAligned` | `true` |
| `stripeWebhookSecretConfigured` | `true` |
| `stripeProductionReady` | `true` |
| `resendEmailReady` | `true` (recommended) |

The diagnostic **never** returns `sk_`, `whsec_`, or `re_` values. `stripePublishableKey` (`pk_live_…`) is included for client Stripe.js / mobile wallet only.

---

## 1. Netlify production environment variables

On the **Next.js** Netlify site (same site as beta, production context):

### DATABASE_URL — is it pooler :6543?

In Netlify → Site configuration → Environment variables → open `DATABASE_URL` (Production). You only need the **host** and **port** — ignore the password.

| What you see in the URL | Verdict |
|-------------------------|---------|
| `….pooler.supabase.com:6543/…` | Good — transaction pooler |
| `….pooler.supabase.com:5432/…` | OK on Netlify — app rewrites this to `:6543` at runtime |
| `db.xkaaicokjgmpbctfermj.supabase.co:5432/…` | Bad for serverless — direct DB; change to transaction pooler |
| Host has `pooler` but you can’t find `:6543` or `:5432` | Treat as unknown — copy host only and compare below |
| Value is secret-masked and only the end shows `…it=1` | Likely ends with `connection_limit=1` — good flag, still reveal host/port once |

**If Netlify hides the value (secret):** Netlify will not let you read it back after save. Don’t fight the UI — either:

1. **Overwrite** Production with a fresh URI from Supabase → Database → Connection string → **Transaction** (port 6543), or  
2. After deploy, open admin Platform Health — API / Database shows **host:port only** (no password).

**Correct shape (password redacted):**
`postgresql://postgres.xkaaicokjgmpbctfermj:***@aws-0-REGION.pooler.supabase.com:6543/postgres`

From Supabase → Project Settings → Database → Connection string → **Transaction** pooler (port 6543). Prefer URI with `pgbouncer=true` (app also adds `connection_limit=1` in serverless).

Keep a separate **Direct** connection string only for migrations (`DIRECT_URL` / local migrate) — not for Netlify `DATABASE_URL`.

### Stripe — switch to live mode

| Variable | Production value |
|----------|------------------|
| `STRIPE_SECRET_KEY` | `sk_live_…` from Stripe Dashboard (live mode) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_…` from Stripe Dashboard (live mode) |
| `STRIPE_WEBHOOK_SECRET` | Signing secret from **live** webhook endpoint |
| `STRIPE_CONNECT_PUBLIC_APP_URL` | `https://shopgetvaulted.com` |
| `CRON_SECRET` | Random secret for `POST /api/cron/stripe-reconcile` (and other crons) |

**Leave beta/preview contexts on test keys** if you use Netlify deploy contexts — only the production context for `shopgetvaulted.com` must use live keys.

All server paths read from these env vars:

- Checkout sessions — `web/src/services/payments.ts`
- Connect onboarding — `web/src/app/api/stripe/connect/*`
- Saved payment methods — `web/src/app/api/account/payment-methods/*`
- Live buy-now / breaks / variants — `web/src/lib/live-payment-pipeline.ts`, live room purchase routes
- Refunds — `web/src/services/order-refund-request.ts`
- Webhooks — `web/src/app/api/stripe/webhook/route.ts`

Optional: keep `STRIPE_TAX_ENABLED=1` when Stripe Tax is registered for TX.

### Resend — auth email

| Variable | Production value |
|----------|------------------|
| `RESEND_API_KEY` | `re_…` from Resend dashboard |
| `RESEND_FROM` | Verified sender, e.g. `Get Vaulted <hello@shopgetvaulted.com>` |

**Signup note:** With the shared Supabase project, new web accounts use **Supabase Auth confirmation email** (`webSignupVerificationMethod: supabase_link`). Resend is still required for:

- `POST /api/auth/resend-verification` (production returns 503 without `RESEND_API_KEY`)
- Any future non-Supabase signup path

Ensure Supabase Auth email templates work for prod signups (Dashboard → Authentication → Email templates).

### Unchanged (already correct)

| Variable | Value |
|----------|--------|
| `NEXTAUTH_URL` | `https://shopgetvaulted.com` |
| `NEXT_PUBLIC_SITE_URL` | `https://shopgetvaulted.com` |
| `NEXT_PUBLIC_SUPABASE_URL` / keys | Same project as beta/mobile |
| OAuth provider flags | No change unless broken |

### Automated Netlify update (optional)

If Netlify CLI is linked to the site:

```bash
cd web
CONFIRM_PROD_LAUNCH=1 \
  STRIPE_SECRET_KEY=sk_live_... \
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  RESEND_API_KEY=re_... \
  RESEND_FROM="Get Vaulted <hello@shopgetvaulted.com>" \
  npm run configure:prod-launch-env
```

Then trigger a **production deploy**.

---

## 2. Stripe Dashboard (live mode)

1. Toggle Dashboard to **Live** mode.
2. **Developers → API keys** — copy live `sk_live_` and `pk_live_` into Netlify (step 1).
3. **Developers → Webhooks** — add endpoint:
   - URL: `https://shopgetvaulted.com/api/stripe/webhook`
   - Events (full set handled by `processStripeWebhookEvent`):
     - `checkout.session.completed`
     - `checkout.session.expired`
     - `payment_intent.succeeded`
     - `payment_intent.payment_failed`
     - `charge.refunded`
     - `charge.dispute.created`
     - `charge.dispute.closed`
     - `account.updated`
     - `capability.updated`
   - Copy **Signing secret** → `STRIPE_WEBHOOK_SECRET` on Netlify production.
   - Disable any endpoint pointing at `/.netlify/functions/stripe-webhook` (legacy; Next.js is source of truth).
   - Verify with: `cd web && npm run check:stripe-setup`
4. **Connect** — confirm platform settings; return URLs resolve via `STRIPE_CONNECT_PUBLIC_APP_URL`.
5. **Tax** — enable Stripe Tax + TX registration if collecting sales tax (see Admin → Sales tax nexus).

### Verify live webhooks

After deploy, send a test event from Stripe Dashboard → Webhooks → your endpoint → **Send test webhook**, or complete a small live-mode test checkout in a controlled environment.

Check Netlify function logs for `200` on `POST /api/stripe/webhook`.

---

## 3. Supabase Auth (production URLs + sign-in)

**Site URL** should be `https://shopgetvaulted.com` with redirect URLs for prod, beta, and localhost (see [production-domain-migration.md](./production-domain-migration.md)).

Automated update (does **not** overwrite OAuth secrets — uses Management API PATCH):

```bash
cd web
# Create token: https://supabase.com/dashboard/account/tokens (scope: auth:write)
SUPABASE_ACCESS_TOKEN=sbp_... CONFIRM_PRODUCTION_AUTH_URLS=1 npm run configure:production-auth-urls
```

If Apple sign-in was accidentally disabled, either re-enable in **Dashboard → Authentication → Providers → Apple**, or:

```bash
SUPABASE_ACCESS_TOKEN=sbp_... CONFIRM_FIX_APPLE_AUTH=1 npm run fix:supabase-apple-auth
```

**Do not** use `supabase config push` for auth URL changes — local `config.toml` can disable OAuth providers.

Manual checks in Supabase Dashboard:

- **Authentication → Providers** — Google + Apple enabled
- **Authentication → URL Configuration** — Site URL `https://shopgetvaulted.com`
- **Authentication → Sign In / Providers** — Email signups enabled (`disable_signup` off)

After the DB wipe, create your admin + Get Vaulted seller accounts in **Authentication → Users** (or sign up on `/join`).

---

## 4. Resend Dashboard

1. Add and verify domain `shopgetvaulted.com` (DNS records).
2. Create production API key → `RESEND_API_KEY`.
3. Set `RESEND_FROM` to an address on the verified domain.
4. Test:
   - Sign up on `https://shopgetvaulted.com/join` (Supabase confirmation email)
   - If applicable, trigger resend verification for a legacy account

---

## 5. Post-fix verification

```bash
cd web
npm run check:production-deployment
```

Confirm:

- Homepage `200 OK` + HSTS
- `stripeProductionReady: true`
- `stripeMode: live` (not `test`)
- `resendEmailReady: true`
- Supabase alignment unchanged

---

## Related docs

- [production-domain-migration.md](./production-domain-migration.md) — domain cutover
- [beta-environment-alignment.md](./beta-environment-alignment.md) — Supabase ref alignment
- `.env.example` — local variable reference
