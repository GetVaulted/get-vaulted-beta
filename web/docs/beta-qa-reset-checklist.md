# Beta QA reset — clean seller + buyer path

**Prerequisite:** [Local QA pre-deploy gate](./local-qa-pre-deploy-gate.md) must be **Pass** on the commit you deploy. Beta is for **smoke / near-final validation**, not primary debugging.

Use this pass **instead of** debugging legacy accounts (e.g. `brysmith31`). Commerce manual QA on beta is **paused** until local gate L0 is green.

**Canonical project:** `xkaaicokjgmpbctfermj`  
**Canonical API host:** `https://beta.shopgetvaulted.com`

---

## QA accounts

| Role | Email | Username | Password |
|------|-------|----------|----------|
| Seller | `sellerqa@getvaultedtest.com` | `sellerqa` | `VaultedBetaQA1!` (or `BETA_QA_ACCOUNT_PASSWORD` if set for seed script) |
| Buyer | `buyerqa@getvaultedtest.com` | `buyerqa` | same |

Store passwords in your team password manager; rotate if shared outside the core QA group.

---

## Step 0 — Environment alignment (required)

Confirm before any sign-up:

| Check | Expected |
|-------|----------|
| Netlify beta `DATABASE_URL` | Supabase project ref **`xkaaicokjgmpbctfermj`** |
| Netlify beta `NEXT_PUBLIC_SUPABASE_URL` | `https://xkaaicokjgmpbctfermj.supabase.co` |
| Netlify beta `SUPABASE_URL` + keys | Same project |
| Mobile `EXPO_PUBLIC_SUPABASE_URL` | `https://xkaaicokjgmpbctfermj.supabase.co` |
| Mobile `EXPO_PUBLIC_SITE_URL` | `https://beta.shopgetvaulted.com` |
| Local `web/.env` `DATABASE_URL` | Same pooler URI as Netlify (see [beta-environment-alignment.md](./beta-environment-alignment.md)) |

From `web/`:

```bash
npm run verify:beta-env
```

**Pass:** single project ref `xkaaicokjgmpbctfermj`, no mismatch lines.

---

## Step 0b — Complete beta wipe (launch simulation — recommended)

For a **brand-new platform** with zero legacy users/products:

```bash
# Preview (prints every table row count + Auth users that will be deleted):
CONFIRM_BETA_FULL_WIPE=1 ALLOW_BETA_QA_SEED=1 npm run qa:wipe-beta-full -- --dry-run

# Execute full wipe + fresh seed:
CONFIRM_BETA_FULL_WIPE=1 ALLOW_BETA_QA_SEED=1 npm run qa:wipe-beta-full
```

**Hard guards:** requires `CONFIRM_BETA_FULL_WIPE=1` + `ALLOW_BETA_QA_SEED=1` + project ref **`xkaaicokjgmpbctfermj`** on both `DATABASE_URL` and `SUPABASE_URL`. Refuses any other database.

Wipes **everything** — all Prisma app tables, all Supabase Auth users — then seeds only `sellerqa` / `buyerqa` with Stripe snapshot + buyer wallet.

**Critical:** `web/.env.local` must contain beta `DATABASE_URL` (ref `xkaaicokjgmpbctfermj`) — same URI as Netlify. Without it, the script cannot reach beta Postgres (local machine had no `.env`).

After wipe, confirm deployed API is empty:

```bash
npm run qa:verify-beta-clean
```

Emergency partial cleanup (no DATABASE_URL — sellerqa only):

```bash
npm run qa:purge-beta-catalog-api
```

Or run `scripts/beta-supabase-sql-wipe.sql` in Supabase SQL editor, then re-seed with `qa:wipe-beta-full`.

### Partial QA reset (preserves other beta users)

If you need to clean only sellerqa/buyerqa without deleting every beta user:

```bash
CONFIRM_BETA_QA_RESET=1 ALLOW_BETA_QA_SEED=1 npm run qa:reset-beta-environment
```

### Bootstrap accounts only (no commerce wipe)

```bash
ALLOW_BETA_QA_SEED=1 npm run qa:seed-beta-accounts
ALLOW_BETA_QA_SEED=1 npm run qa:seed-beta-accounts -- --reset
```

Account-only seed does **not** complete Stripe — use full wipe above for PC launch simulation.

### Web sign-in (PC) — required before auction QA

Mobile uses **Supabase Auth**; beta web sign-in must validate the same credentials (not legacy Prisma-only passwords).

- [ ] After Netlify deploy with unified web auth: open `https://beta.shopgetvaulted.com/api/auth/config` — `projectRef` = `xkaaicokjgmpbctfermj`, `alignedWithBeta` = true, `webSignInSupportsSupabaseAuth` = true.
- [ ] Sign in at `/signin` with **`sellerqa@getvaultedtest.com`** (same password as mobile). Session loads; Seller HQ / account pages work.
- [ ] Web **Join** may show “email not configured” without `RESEND_API_KEY` — that only blocks **web** sign-up, not mobile-created accounts.
- [ ] **Buyer mobile discovery:** `EXPO_PUBLIC_SITE_URL=https://beta.shopgetvaulted.com` in the buyer build. Pull-to-refresh on **Live** tab; `sellerqa` scheduled + live rooms appear (from `GET /api/live-rooms`, not legacy Supabase `live_shows`).
- [ ] **Seller payout stability:** After Stripe setup, pull-to-refresh Seller HQ — payout stays **Ready/Complete** across app restart (same `sellerqa` email → one Connect account; check `GET /api/stripe/connect/status` `stripe_account_id` unchanged).

---

## Step 1 — Fresh seller path

Device/browser A — seller account only.

- [ ] Sign out any old session (Home → sign out, or Seller HQ footer **Sign out**).
- [ ] Sign up or sign in as **`sellerqa@getvaultedtest.com`** (password above).
- [ ] Open **Seller HQ** tab — not “Become a Seller” for a broken session; payout status loads (no permanent “Could not load payout status”).
- [ ] **Start Seller Setup** → Stripe **test** onboarding completes; return URL hits `https://beta.shopgetvaulted.com/mobile/stripe-connect-return`.
- [ ] Pull to refresh Seller HQ — payout badge **Complete** or **Ready**; **Seller Studio** / approved lane visible.
- [ ] Add or confirm **ship-from** (Seller HQ ship-from card or Settings).
- [ ] Seller HQ shows **ready** for go-live (live-readiness gate clears for ship-from + payouts).

**Seller pass record:** Pass/Fail · Date · Build · Notes __________

---

## Step 2 — Fresh buyer path

Device/browser B (or second mobile profile) — buyer only.

- [ ] Sign out; sign up or sign in as **`buyerqa@getvaultedtest.com`**.
- [ ] Open **Live** → enter seller’s live room (after seller schedules/goes live in Step 3 prep, or use existing beta room).
- [ ] Place at least one bid; bid accepted or clear error (wallet/shipping if configured).

**Buyer pass record:** Pass/Fail · Date · Build · Notes __________

---

## Step 3 — Commerce manual QA (only after Steps 0–2 Pass)

Resume in order:

1. [Live Auction E2E](./LIVE_AUCTION_E2E_QA.md#live-auction-manual-staging-checklist) — seller `sellerqa`, buyer `buyerqa`
2. [Orders & Fulfillment](./orders-fulfillment-qa-checklist.md#orders--fulfillment-manual-staging-checklist)

Update commerce gate tables with date/build/tester when each passes.

---

## Do not

- Use `brysmith31` for this beta pass unless clean accounts fail and you are explicitly regression-testing legacy data.
- Create extra Stripe Connect accounts to work around env mismatch.
- Mark commerce **staging-signed** until beta QA reset **and** live auction + O&F manuals pass.

---

## Sign-off

| Milestone | Status |
|-----------|--------|
| Env alignment (`verify:beta-env`) | |
| Seller QA path (Step 1) | |
| Buyer QA path (Step 2) | |
| Live Auction manual (commerce gate step 2) | |
| Orders & Fulfillment manual (commerce gate step 3) | |
| Commerce loop staging-signed | **No** until all above Pass |
