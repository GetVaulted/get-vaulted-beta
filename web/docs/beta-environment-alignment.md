# Beta environment alignment (Supabase + Postgres)

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

## Local `web/.env` gotcha

`@/lib/prisma` reads **`DATABASE_URL` first**, then falls back to **`INTEGRATION_DATABASE_URL`**.

If you only set `INTEGRATION_DATABASE_URL` (common for `staging:validate`), scripts that used to error may now fall back — but you should still set:

```env
DATABASE_URL="<same pooled URI as Netlify beta>"
INTEGRATION_DATABASE_URL="<optional; same URI for integration tests>"
```

Use the **Transaction pooler** URI for serverless (append `?pgbouncer=true&connection_limit=1` per `.env.example`).

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

Compare `<ref>` to the mobile build’s `EXPO_PUBLIC_SUPABASE_URL` (EAS secrets or `mobile/.env` at build time).

## Decode mobile JWT `iss` (optional)

In [jwt.io](https://jwt.io), paste the Supabase access token from the device (after sign-in). Claim `iss` should be `https://<ref>.supabase.co/auth/v1`. That `<ref>` must equal Netlify `DATABASE_URL` project ref.

## Do not

- Create new Stripe Connect accounts to “fix” missing seller state until refs align.
- Run `diagnose-seller-user` against a disposable integration DB expecting beta users to appear.
