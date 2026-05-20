# Beta QA reset — clean seller + buyer path

Use this pass **instead of** debugging legacy accounts (e.g. `brysmith31`). All manual commerce QA is blocked until this checklist is **Pass**.

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

## Step 0b — Bootstrap accounts (optional script)

If Supabase Auth users do not exist yet, from `web/` with service role in `.env`:

```bash
# web/.env needs: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL, ALLOW_BETA_QA_SEED=1
ALLOW_BETA_QA_SEED=1 npm run qa:seed-beta-accounts
# Recreate from scratch:
ALLOW_BETA_QA_SEED=1 npm run qa:seed-beta-accounts -- --reset
```

This creates Auth + Prisma `User` rows. It does **not** complete Stripe — seller still runs Seller Setup on device.

**Or** sign up manually in the app (validates full signup UX).

### Web sign-in (PC) — required before auction QA

Mobile uses **Supabase Auth**; beta web sign-in must validate the same credentials (not legacy Prisma-only passwords).

- [ ] After Netlify deploy with unified web auth: open `https://beta.shopgetvaulted.com/api/auth/config` — `projectRef` = `xkaaicokjgmpbctfermj`, `alignedWithBeta` = true, `webSignInSupportsSupabaseAuth` = true.
- [ ] Sign in at `/signin` with **`sellerqa@getvaultedtest.com`** (same password as mobile). Session loads; Seller HQ / account pages work.
- [ ] Web **Join** may show “email not configured” without `RESEND_API_KEY` — that only blocks **web** sign-up, not mobile-created accounts.

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
