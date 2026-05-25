# Beta environment alignment (Supabase + Postgres)

**Deploy policy:** Run [local-qa-pre-deploy-gate.md](./local-qa-pre-deploy-gate.md) locally before pushing to beta. Beta is smoke-only after local green.

Mobile beta QA fails when **Supabase Auth** (mobile JWT) and **Prisma Postgres** (Netlify `DATABASE_URL`) point at **different projects**, or when local `web/.env` does not use the same project as the phone build.

## Single source of truth

**Beta QA canonical project:** `xkaaicokjgmpbctfermj` (`https://xkaaicokjgmpbctfermj.supabase.co`).

Everything must share one **Supabase project ref** (subdomain):

| Surface | Variable | Must match ref |
|---------|----------|----------------|
| Mobile app (bundled at build) | `EXPO_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| Netlify beta Next.js | `DATABASE_URL` | Pooler/direct URI containing `<ref>` |
| Netlify beta Next.js | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_URL` | `https://<ref>.supabase.co` |
| Netlify beta | `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_ANON_KEY` | Keys from **same** project |
| Local `web/.env` | `DATABASE_URL` (and optional `INTEGRATION_DATABASE_URL`) | Same Postgres as above |
| Local `mobile/.env` | `EXPO_PUBLIC_SUPABASE_URL` | Same as mobile build used on device |

`EXPO_PUBLIC_SITE_URL=https://beta.shopgetvaulted.com` only selects the **API host** (Next.js on Netlify). It does **not** choose the database.

## Auth (mobile vs web)

| Surface | Sign-up | Sign-in |
|---------|---------|---------|
| Mobile | Supabase `auth.signUp` | Supabase `auth.signInWithPassword` |
| Web `/signin` | Prisma + Resend verification (`/api/register`) | NextAuth credentials: Prisma `passwordHash` **or** Supabase `signInWithPassword` (same as mobile) |

Mobile-created users live in **Supabase Auth** first. Web sign-in calls the same Supabase project (`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`), then links/creates the Prisma `User` row.

**Beta check:** `GET https://beta.shopgetvaulted.com/api/auth/config` → `projectRef` must be `xkaaicokjgmpbctfermj`.

**Unified auth (beta):** Web Join and mobile Create Account both register through **Supabase Auth** on the beta project (`xkaaicokjgmpbctfermj`). Web sign-in uses the same Supabase credentials (via NextAuth) so accounts work on either platform with one email/password. Email confirmation is **off** on beta Supabase (`enable_confirmations = false`) — sign-up returns an immediate session unless your hosted Supabase project differs.

Legacy Resend OTP sign-up (non-beta / local dev with `RESEND_API_KEY`) creates web-only Prisma password accounts and does not sync to mobile.

## Local `web/.env` gotcha

`@/lib/prisma` reads **`DATABASE_URL` first**, then falls back to **`INTEGRATION_DATABASE_URL`**.

If you only set `INTEGRATION_DATABASE_URL` (common for `staging:validate`), scripts that used to error may now fall back — but you should still set:

```env
DATABASE_URL="<same pooled URI as Netlify beta>"
INTEGRATION_DATABASE_URL="<optional; same URI for integration tests>"
```

Use the **Transaction pooler** URI for serverless (append `?pgbouncer=true&connection_limit=1` per `.env.example`).

### Local sign-in with beta-created accounts

Beta web Join (Supabase Auth fallback) creates users in **Supabase Auth + Prisma** without a Prisma `passwordHash`. Local `/signin` must therefore have:

| Variable | Local value | Why |
|----------|-------------|-----|
| `DATABASE_URL` | Same beta project `xkaaicokjgmpbctfermj` | Prisma user lookup |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xkaaicokjgmpbctfermj.supabase.co` | Already in `.env` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key from **same** Supabase project | Enables `signInWithPassword` in NextAuth |
| `NEXTAUTH_URL` | `http://localhost:3000` | Session cookies for local dev |
| `NEXTAUTH_SECRET` | Any long random string (local only) | Required by NextAuth |

Put localhost overrides in **`web/.env.local`** (gitignored), not Netlify:

```bash
cd web
npm run setup:local-auth-env   # copies anon key from mobile/.env, sets NEXTAUTH_URL + secret
npm run verify:beta-env
npm run dev
```

Test credential path without the browser:

```bash
npx tsx scripts/test-local-supabase-signin.ts your@email.com
```

**Not required for email/password sign-in:** Supabase redirect allowlist (`http://localhost:3000/**`) only affects magic-link/OAuth flows. Credentials sign-in is server-side.

**Beta cookies on localhost:** Sessions from `beta.shopgetvaulted.com` do not carry over — different host and usually different `NEXTAUTH_SECRET`. Clear site data for localhost if sign-in acts stuck after fixing env.

## Verify locally

From `web/`:

```bash
npm run verify:beta-env
npx tsx scripts/verify-beta-env-alignment.ts sellerqa@getvaultedtest.com
npx tsx scripts/diagnose-seller-user.ts sellerqa
```

**Clean beta QA:** use [`beta-qa-reset-checklist.md`](./beta-qa-reset-checklist.md) with `sellerqa@getvaultedtest.com` / `buyerqa@getvaultedtest.com` — not legacy `brysmith31`.

Interpretation:

| Result | Meaning |
|--------|---------|
| Auth user found, Prisma User **0** | Same project; open Seller HQ once so APIs create/link `User` (or sign in on web). |
| Auth **0**, Prisma **0** | Wrong project in local env **or** user only exists on another Supabase project (check Netlify). |
| Multiple project refs printed | Fix env before any payout/QA work. |

## Netlify beta checklist (UI)

For site **beta.shopgetvaulted.com** (package dir `web`):

1. `DATABASE_URL` — pooled Supabase Postgres for project `<ref>`
2. `DIRECT_URL` — direct connection (migrations), same project
3. `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL` — `https://<ref>.supabase.co`
4. `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_ANON_KEY` — matching anon key
5. `SUPABASE_SERVICE_ROLE_KEY` — same project (webhooks, admin scripts)
6. `NEXTAUTH_URL` / `STRIPE_CONNECT_PUBLIC_APP_URL` — `https://beta.shopgetvaulted.com` (not the static apex)
7. **`RESEND_API_KEY`** — required for web Join OTP emails (`/api/register`). Without it, beta uses Supabase Auth signup fallback until configured.
8. **`RESEND_FROM`** — optional; defaults to `Get Vaulted <onboarding@resend.dev>` for Resend trial.

Configure Resend + Supabase Auth redirects:

```bash
CONFIRM_BETA_SIGNUP_EMAIL=1 RESEND_API_KEY=re_... npm run configure:beta-signup-email
```

Verify after deploy:

```bash
curl https://beta.shopgetvaulted.com/api/auth/config
```

Expect `webSignupAvailable: true`. With Resend: `webSignupVerificationMethod: "resend_code"`. Without Resend on beta: `"supabase_link"` (confirmation email via Supabase).

**Supabase Dashboard** (project `xkaaicokjgmpbctfermj` → Authentication → URL configuration):

| Setting | Value |
|---------|--------|
| Site URL | `https://beta.shopgetvaulted.com` |
| Redirect URLs | `https://beta.shopgetvaulted.com/**`, `http://localhost:3000/**` |

Optional: Authentication → SMTP → Resend (`smtp.resend.com`, user `resend`, password = `RESEND_API_KEY`) so mobile confirmation emails use your domain.

Compare `<ref>` to the mobile build’s `EXPO_PUBLIC_SUPABASE_URL` (EAS secrets or `mobile/.env` at build time).

## Decode mobile JWT `iss` (optional)

In [jwt.io](https://jwt.io), paste the Supabase access token from the device (after sign-in). Claim `iss` should be `https://<ref>.supabase.co/auth/v1`. That `<ref>` must equal Netlify `DATABASE_URL` project ref.

## Do not

- Create new Stripe Connect accounts to “fix” missing seller state until refs align.
- Run `diagnose-seller-user` against a disposable integration DB expecting beta users to appear.
