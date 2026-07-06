# Get Vaulted — Pre-Launch Security Audit (July 2026)

Scope: Authentication & Sessions, Authorization/Access Control, API Security, Stripe/Payments,
Live Auction Security, File Upload/Image Security, Web Security, Mobile Security, Webhooks/Cron,
Infrastructure/Deployment. Reviewed as a malicious buyer, seller, admin, and anonymous user.

Full regression suite after all fixes: **web 169 test files / 827 tests passing**, **mobile 70
test files / 324 tests passing**, `tsc --noEmit` clean on both.

---

## Fixed this pass

### 1. Plaintext passwords persisted in "Remember me" (web + mobile)
- **Severity:** High
- **Evidence:** `web/src/lib/remember-me-credentials.ts`, `mobile/src/lib/rememberMeCredentials.ts` (pre-fix) wrote the user's plaintext password into `localStorage` / a cache file next to the email, for autofill.
- **Attack scenario:** Any XSS, malicious browser extension, device-sharing, or unencrypted device backup/extraction exposes the plaintext password directly — not just a session token.
- **Impact:** Full account takeover using the user's real password (which they likely reuse elsewhere), not just the app session.
- **Fix:** Both platforms now persist only the email + the remember-me preference (`v: 2` payload). Password is never written to disk. Legacy `v1` payloads (with a password) are read once and discarded, never re-persisted.
- **Tests:** `web/src/lib/remember-me-credentials.test.ts`, `mobile/src/lib/rememberMeCredentials.test.ts` — cover new email-only flow, and regression tests asserting a password is never written and that stale `v1` payloads are ignored.

### 2. Host could tamper with `currentBidUsd` mid-auction to manipulate the settlement price
- **Severity:** Critical
- **Evidence:** `web/src/app/api/live-rooms/[id]/items/[itemId]/route.ts` (PATCH) — `currentBidUsd` was accepted and written unconditionally, unlike sibling pricing fields (`startingBidUsd`, `priceUsd`, `reservePriceUsd`) which were already correctly gated behind `!pricingLocked`. `currentBidUsd` flows directly into the buyer's charge at settlement (`web/src/lib/live-room-item-unit-sale.ts:96-133`, `web/src/lib/live-variant-spot-auction-settle.ts:95`).
- **Attack scenario:** A seller/host (the only caller `requireLiveRoomHostUser` allows) sends `PATCH .../items/:id { "currentBidUsd": 1 }` while bidding is open or right before marking an item sold, to under-charge a colluding buyer, or inflate it to defraud the actual winning bidder — bypassing all of the validated bid-increment/proxy-bid logic in the real `/bid` endpoint.
- **Impact:** Direct payment-integrity bypass — the platform and the real winning bidder can be defrauded of the correct settlement amount.
- **Fix:** `currentBidUsd` is now only editable through this endpoint when `!pricingLocked` (i.e., before bidding opens and before the item is sold), identical to the other pricing fields. Once bidding is open or the item is sold, this endpoint silently drops the field; only the signature-free-of-tampering `/bid` route (which validates increments/proxy bids) can move it from then on.
- **Tests:** `web/src/app/api/live-rooms/[id]/items/[itemId]/route.test.ts` (new) — asserts the field is rejected while `biddingOpen` or `status === "sold"`, still works on an idle lot, and can't be smuggled in alongside an unrelated field.

### 3. Stripe refunds had no idempotency key
- **Severity:** High
- **Evidence:** `web/src/services/order-refund-request.ts:545`, `web/src/services/layaway.ts:147,1148,1181` — all four `stripe.refunds.create(...)` call sites had no `idempotencyKey`, unlike every PaymentIntent/Checkout Session creation call elsewhere in the codebase (`web/src/services/payments.ts`, `stripe-charge-order-saved-pm.ts`, etc.), which all do.
- **Attack scenario:** A network blip/timeout, a double-submitted admin refund click, or a cron/webhook retry re-runs the same refund logic. Without an idempotency key, Stripe processes it as a brand-new refund — double-refunding the buyer out of the platform's or seller's funds.
- **Impact:** Direct financial loss on any retried refund path (manual admin refunds, layaway supersede/default refunds, layaway tax-only refunds).
- **Fix:** Added deterministic `idempotencyKey`s scoped to the specific refund request/payment/amount (`order_refund_<requestId>_<cents>c`, `layaway_superseded_refund_<paymentId>`, `layaway_default_refund_<paymentId>_<cents>c`, `layaway_default_tax_refund_<paymentId>_<cents>c`).
- **Tests:** Updated `web/src/services/order-refund-request.test.ts` and `web/src/services/layaway.test.ts` to assert the idempotency key on every call site.

### 4. Unauthenticated Host-header bypass on AWS IVS credential diagnostics
- **Severity:** Medium (information disclosure)
- **Evidence:** `web/src/app/api/qa/ivs-env-diagnostics/route.ts` (pre-fix) allowed the request through if the client-supplied `Host` header equaled `beta.shopgetvaulted.com` or ended with `.netlify.app` — with **no authentication at all** — in addition to the intended `GV_ALLOW_QA_SESSION_DEBUG` gate that its sibling route (`/api/qa/session-debug`) correctly uses alone.
- **Attack scenario:** Any anonymous visitor to the public beta deployment hits `GET /api/qa/ivs-env-diagnostics` directly; no header spoofing needed since `beta.shopgetvaulted.com` is genuinely reachable by anyone.
- **Impact:** Leaks AWS access-key prefix/length, secret-key length, credential source, and region for the IVS credentials — reconnaissance data that meaningfully narrows a credential-guessing/targeting effort. No full secret is returned, hence Medium not Critical.
- **Fix:** Removed the Host-header bypass entirely; the route now relies solely on `isQaSessionDebugAllowed()` (dev, or `GV_ALLOW_QA_SESSION_DEBUG=1`), matching its sibling route.
- **Tests:** `web/src/app/api/qa/ivs-env-diagnostics/route.test.ts` (new) — regression-tests that a spoofed `beta.shopgetvaulted.com` / `*.netlify.app` Host header no longer grants access, and that the explicit env flag still works.

### 5. `promote-user-admin.ts` had zero safety rails
- **Severity:** Medium (operational/insider-risk hardening)
- **Evidence:** `web/scripts/promote-user-admin.ts` (pre-fix) — grants full admin (finance, moderation, user management) to any email, against whatever `DATABASE_URL` happens to be loaded from `.env`/`.env.local`, with no confirmation step, no display of which database/host it's about to mutate, and no reuse of the `production-host-guard` module already used by every other admin-provisioning script in the repo.
- **Attack/mistake scenario:** Wrong `.env` sourced locally (e.g., a stale prod `.env.local` left over from a prior real promotion), a typo'd email, or a compromised dev machine silently grants admin with no operator confirmation or audit trail of "what was I about to change."
- **Impact:** Unauthorized or accidental privilege escalation to full admin.
- **Fix:** Script now always prints the resolved DB host, Supabase project ref, redacted `DATABASE_URL`, and whether `findProductionHostEnvVar()` detects a production site-URL — then requires an explicit `--yes` flag (or `CONFIRM_PROMOTE_ADMIN=1`) before mutating anything. Also removed a dead, broken `qaPassword()` helper in `web/scripts/fix-beta-admin-qa.ts` that referenced an undefined `EXPECTED_PASSWORD` variable (would have thrown if ever called).
- **Tests:** Not unit-tested (no other script in `web/scripts/` has test coverage; these are operator-run CLI tools, not part of the request-serving surface). Verified by reading + `tsc --noEmit`.

### 6. Missing web security headers
- **Severity:** Medium
- **Evidence:** `web/next.config.ts` had no `headers()` — no `X-Frame-Options`, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy` on any response, and no CSP at all.
- **Attack scenario:** Clickjacking (embedding `shopgetvaulted.com` in a hidden iframe on an attacker page to trick users into clicking real buttons); MIME-sniffing based content-type confusion attacks; browsers not enforcing HTTPS upgrade on repeat visits.
- **Impact:** Increases exposure surface for social-engineering/UI-redress attacks; no defense-in-depth if an XSS vector is ever found later.
- **Fix:** Added `web/src/lib/security-headers.ts`, wired into `next.config.ts`'s `headers()`, applied to every route:
  - **Enforced:** `Strict-Transport-Security` (1yr, includeSubDomains, preload), `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/microphone/geolocation/interest-cohort disabled).
  - **Report-Only:** `Content-Security-Policy-Report-Only` with a policy allowing `'self'`, Stripe.js/Elements, Supabase (REST + Realtime), and Sentry ingest. Shipped Report-Only (not enforced) deliberately — see "Remaining risks" below.
- **Tests:** `web/src/lib/security-headers.test.ts` (new, 11 tests).

---

## Verified — no fix needed (evidence-checked this pass)

These were specifically checked against the audit's own line items and found correctly implemented, with fail-closed behavior:

- **Stripe webhook signature verification** (`web/src/lib/stripe.ts:36-63`) — throws if `STRIPE_WEBHOOK_SECRET` is unset or the `stripe-signature` header is missing; uses Stripe's own `constructEvent` (timing-safe).
- **Shippo webhook signature verification** (`web/src/lib/shippo.ts:156-161`) — returns `false` (rejects) if the secret or signature header is missing.
- **IVS events webhook** (`web/src/app/api/aws/ivs/events/route.ts`) — requires `IVS_EVENTS_WEBHOOK_SECRET` via Bearer or custom header; rate-limited per client IP; fails closed if unset.
- **Cron endpoints** (`web/src/app/api/cron/layaway/route.ts`, `.../payout-tier/route.ts`) — explicitly fail closed (`503`) in production if `CRON_SECRET` is unset, with existing regression tests already covering this.
- **Admin authorization** (`web/src/lib/require-admin.ts`) — re-reads `role` and `suspendedAt` from the DB on every call (not a cached/stale JWT claim), so a demoted or suspended admin loses access immediately on next request.
- **File upload validation** (`web/src/app/api/uploads/listing-image/route.ts`) — allowlists only `jpeg`/`png`/`webp` (no SVG, no arbitrary types), validates magic bytes against the claimed MIME type, caps size at 8MB, and writes with a server-generated `randomUUID()` filename (no path traversal via user input).
- **CORS** — no `Access-Control-Allow-Origin` headers are set anywhere; the API is same-origin-only for browser clients (mobile's native fetch is unaffected by CORS, which is a browser-only mechanism).
- **Password reset** — delegated entirely to Supabase Auth's own `resetPasswordForEmail` / session-exchange flow (`web/src/app/forgot-password`, `web/src/app/reset-password`), inheriting Supabase's single-use, time-limited reset tokens rather than custom token logic.
- **NextAuth session** — JWT strategy, 30-day `maxAge` (`web/src/lib/auth.ts:12`) — a bounded, non-infinite session lifetime.

---

## Remaining risks (documented, not fixed this pass — flagging per your instructions rather than making a large change silently)

1. **CSP is Report-Only, not enforced** (Medium). The app has no nonce infrastructure for inline scripts yet, and depends on Stripe.js, Supabase, Sentry, and (dynamically, per live room) AWS IVS/CloudFront hosts for playback. Enforcing a `Content-Security-Policy` (not `-Report-Only`) without first collecting real violation reports risks silently breaking Stripe Checkout embeds or live video. **Recommendation:** run Report-Only in production for 1-2 weeks, review violation reports (wire up a `report-uri`/`report-to` endpoint), then flip to enforced.
2. **Mobile auth tokens are stored in a plaintext JSON file, not the OS Keychain/Keystore** (Medium). `mobile/src/lib/authSessionStorage.ts` persists the Supabase session (access + refresh token) via `expo-file-system` (cache/document directory) or `localStorage` on web, not `expo-secure-store`. This is normal-app-sandboxed (not remotely exploitable), but on a jailbroken/rooted device, or via unencrypted local device-backup extraction, the tokens are readable in plaintext, enabling session takeover without the password. **Recommendation:** migrate to `expo-secure-store` for at least the refresh token; Keychain/Keystore have small size limits (~2KB on iOS) so the full serialized Supabase session may need to be split (short-lived access token in file storage, long-lived refresh token in SecureStore). This is a moderate-sized change (migration path for already-signed-in users, cross-platform testing) — flagging rather than rushing it in this pass.
3. **Beta and production currently share one Supabase project/database** (already known/documented in `web/docs/production-launch-config.md` and mitigated for destructive scripts via `production-host-guard.ts`'s site-URL check) — this remains an architectural risk if a *new* beta-only script is ever added without reusing that guard. Recommend a lint/CI check that greps `web/scripts/reset-*`, `wipe-*`, `purge-*` for the `findProductionHostEnvVar` import.
4. **Six-area subagent audit findings not itemized individually here.** This report documents, with full file/line evidence, everything that was fixed or independently re-verified in this session. The original parallel-subagent audit pass additionally covered lower-severity/informational items (naming conventions, redundant checks, minor UX-adjacent findings) that didn't rise to a launch-blocking or fixable-safely-in-scope bar; if you want the exhaustive raw list from each of the 6 area reports re-generated and itemized, say so and I'll re-run that pass and append it.

---

## Summary

**Critical launch blockers (fixed):**
- Host-tamperable `currentBidUsd` allowing live-auction settlement price manipulation.

**High-risk issues (fixed):**
- Plaintext passwords in "remember me" (web + mobile).
- Missing Stripe refund idempotency keys (double-refund risk on retry).

**Medium/low issues (fixed):**
- Unauthenticated Host-header bypass on IVS credential diagnostics.
- `promote-user-admin.ts` had no confirmation/target-visibility guard.
- Missing web security headers (HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, CSP Report-Only).

**Medium/low issues (documented, not fixed — see Remaining risks):**
- CSP not yet enforced (Report-Only only).
- Mobile auth tokens in plaintext file storage instead of Keychain/Keystore.

**Files changed:**
- `web/src/lib/remember-me-credentials.ts`, `web/src/app/signin/page.tsx`, `mobile/src/lib/rememberMeCredentials.ts`, `mobile/src/screens/auth/AuthLoginScreen.tsx`, `mobile/src/screens/onboarding/LaunchIntroScreen.tsx`
- `web/src/app/api/live-rooms/[id]/items/[itemId]/route.ts`
- `web/src/services/order-refund-request.ts`, `web/src/services/layaway.ts`
- `web/src/app/api/qa/ivs-env-diagnostics/route.ts`
- `web/scripts/promote-user-admin.ts`, `web/scripts/fix-beta-admin-qa.ts`
- `web/next.config.ts`, `web/src/lib/security-headers.ts` (new)

**Tests added/updated:**
- `web/src/lib/remember-me-credentials.test.ts`, `mobile/src/lib/rememberMeCredentials.test.ts`
- `web/src/app/api/live-rooms/[id]/items/[itemId]/route.test.ts` (new)
- `web/src/services/order-refund-request.test.ts`, `web/src/services/layaway.test.ts`
- `web/src/app/api/qa/ivs-env-diagnostics/route.test.ts` (new)
- `web/src/lib/security-headers.test.ts` (new)
- Full suite after all changes: web 169/169 files, 827/827 tests passing; mobile 70/70 files, 324/324 tests passing; `tsc --noEmit` clean on both packages.

**Final recommendation: Launch with monitoring.**

Rationale: the one Critical finding (live-auction settlement price tampering) and both High findings (plaintext remember-me passwords, missing refund idempotency) are fixed and regression-tested. Core auth, admin authorization, webhook/cron auth, and file-upload validation were independently verified as sound. The two remaining documented risks (CSP enforcement, mobile token storage) are real but lower-severity, require device-level or infrastructure-level compromise to exploit (not remotely exploitable by a typical malicious user), and are reasonable to schedule as fast-follow hardening rather than launch blockers — provided Sentry error monitoring (already verified operational in a prior session) is watched closely in the first weeks post-launch.
