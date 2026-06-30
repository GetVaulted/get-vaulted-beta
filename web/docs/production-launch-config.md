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

### Stripe — switch to live mode

| Variable | Production value |
|----------|------------------|
| `STRIPE_SECRET_KEY` | `sk_live_…` from Stripe Dashboard (live mode) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_…` from Stripe Dashboard (live mode) |
| `STRIPE_WEBHOOK_SECRET` | Signing secret from **live** webhook endpoint |
| `STRIPE_CONNECT_PUBLIC_APP_URL` | `https://shopgetvaulted.com` |

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
   - Events: at minimum `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `account.updated`, `charge.refunded` (match existing beta endpoint list).
   - Copy **Signing secret** → `STRIPE_WEBHOOK_SECRET` on Netlify production.
4. **Connect** — confirm platform settings; return URLs resolve via `STRIPE_CONNECT_PUBLIC_APP_URL`.
5. **Tax** — enable Stripe Tax + TX registration if collecting sales tax (see Admin → Sales tax nexus).

### Verify live webhooks

After deploy, send a test event from Stripe Dashboard → Webhooks → your endpoint → **Send test webhook**, or complete a small live-mode test checkout in a controlled environment.

Check Netlify function logs for `200` on `POST /api/stripe/webhook`.

---

## 3. Resend Dashboard

1. Add and verify domain `shopgetvaulted.com` (DNS records).
2. Create production API key → `RESEND_API_KEY`.
3. Set `RESEND_FROM` to an address on the verified domain.
4. Test:
   - Sign up on `https://shopgetvaulted.com/join` (Supabase confirmation email)
   - If applicable, trigger resend verification for a legacy account

---

## 4. Post-fix verification

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
