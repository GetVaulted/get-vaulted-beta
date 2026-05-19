# Seller Go Live readiness — QA sign-off checklist

Repeatable manual sign-off for **Seller Home / Go Live** activation across **web** and **mobile**. Use **staging** with Stripe test mode unless noted.

**Related docs**

- Web Seller Home detail: [`seller-home-qa-checklist.md`](./seller-home-qa-checklist.md)
- Live auction E2E (post go-live): [`LIVE_AUCTION_E2E_QA.md`](./LIVE_AUCTION_E2E_QA.md)

**Naming map**

| Product term | Web route / surface | Mobile surface |
|--------------|---------------------|----------------|
| Seller Home | `/account/seller` (`SellerHubPage`) | Seller Studio → **Overview** tab |
| Seller HQ / listings hub | `/account/listings` (My Listings) | Seller Studio → **Listings** tab |
| Vault HQ / Vault Events | `/seller/live` (event manager + go-live flow) | Seller Studio → **Live** tab (`VaultEventsHub`) |
| Host console | `/seller/live/[roomId]/console` (break) or host controls on live flow | `SellerHostRoom` stack screen |

**Readiness source of truth:** `GET /api/seller/live-readiness` → `canGoLive`, `issues[]`, `checks` (Stripe payouts + **ship-from** required when env gates are on). See `src/services/seller/live-show-readiness.ts`.

---

## 0. Environment prerequisites

- [ ] Staging DB + test seller and buyer accounts.
- [ ] Stripe test keys; Connect Express onboarding enabled.
- [ ] `EXPO_PUBLIC_SITE_URL` (or `EXPO_PUBLIC_WEB_API_URL`) on mobile build points at the same API host as web staging.
- [ ] Live marketplace **not** blocked (`LIVE_MARKETPLACE_COMING_SOON` / middleware 503) if testing host APIs.
- [ ] Optional seed: `npx tsx scripts/seed-live-auction-qa.ts` (see [`LIVE_AUCTION_E2E_QA.md`](./LIVE_AUCTION_E2E_QA.md) §0).

**Tester:** ____________  
**Date:** ____________  
**Web build / URL:** ____________  
**Mobile build / device:** ____________

---

## 1. Seller state matrix

Use one persona per row (or reset account between rows). Confirm **banners, CTAs, and routes** match the expected column — no dead-end taps.

| State | How to reach (test data) | Web — expected UX | Mobile — expected UX |
|-------|--------------------------|-------------------|----------------------|
| **Logged out** | Sign out | Seller Home redirects to sign-in; Go Live nav requires auth | Seller tab shows guest banner → sign up / sign in |
| **No seller setup** | New user, no Stripe account | Seller Home: “Become a seller” / setup progress; Schedule Live scrolls to payouts | Studio banner: **Become a Seller** → Stripe onboarding |
| **Stripe started, incomplete** | Connect account exists, `stripeOnboardingComplete` false | Payouts “Finish setup”; Schedule Live guides to payouts, not `/seller/live` | Banner **Finish Seller Setup**; schedule/host gated; Connect badge not Complete |
| **Payouts enabled, missing ship-from** | Onboarding complete, empty ship-from fields | Payouts ready; ship-from section required; Schedule Live blocked until address saved | Ship-from card on Overview; Vault Events banner + disabled schedule FAB; host **Go live** blocked in console |
| **Fully ready seller** | Payouts + complete ship-from | `canGoLive: true`; Schedule Live → `/seller/live`; readiness “Ready” | `liveGate.blocked === false`; schedule modal works; host can go live |
| **Live-enabled seller** | Ready + existing scheduled/live room | Vault Events on `/seller/live`; host console opens; start-live succeeds | Vault Events cards → command center; stream provision + go live |

### Per-state checks (both platforms)

- [ ] **Logged out** — No access to seller APIs without auth; CTAs lead to sign-in, not blank screens.
- [ ] **No seller setup** — Listing publish / live CTAs explain payouts first (no silent failure).
- [ ] **Stripe incomplete** — “Continue setup” / “Finish Seller Setup” opens onboarding (web embed or mobile auth session).
- [ ] **Missing ship-from** — Copy mentions **shipping address** (not only payouts); CTA reaches ship-from form (web Seller Home section / mobile `SellerShipFromSetupCard`).
- [ ] **Fully ready** — Schedule + host entry allowed; readiness issues list empty.
- [ ] **Live-enabled** — Can open existing room command center; **Go live** / `PATCH` start succeeds when room is scheduled.

---

## 2. Web QA

### Seller Home (`/account/seller`)

- [ ] Setup progress reflects Stripe + ship-from (required) vs recommended profile items.
- [ ] **Schedule Live Show** — if not ready, scrolls/guides to payouts or ship-from (no dead navigation).
- [ ] **Go Live** link in Live Rooms card routes to `/seller/live` when ready.
- [ ] Payouts: **Continue setup** / **Manage payouts** / embed polling updates status without full page reload.
- [ ] Ship-from: save valid address → toast + readiness updates; incomplete save shows `Please complete your address.`
- [ ] After Stripe embed completes, `guideToNextReadinessStep` toast points to ship-from or “ready to go live.”

### Vault HQ (`/seller/live` — event manager)

- [ ] Page loads for authenticated seller; readiness panel shows payouts + shipping rows.
- [ ] Links **Set up →** / **Add →** go to `/account/seller` when checks fail.
- [ ] Schedule / create room flow respects `canGoLive` (UI disabled or server error with `issues`).
- [ ] Room list: **Console** (break) / host entry routes to correct console URL.

### Seller Live page (`/seller/live`)

- [ ] **Go live readiness** section matches `GET /api/seller/live-readiness`.
- [ ] Create / schedule room works when `canGoLive: true`.
- [ ] Start-live control blocked with actionable copy when `canGoLive: false`.

### Schedule Vault Event (web)

- [ ] Cannot complete schedule while readiness false (or user is guided to Seller Home first).
- [ ] After readiness true, scheduled room appears in list with correct status.

### Go Live entry points (web)

- [ ] Navbar account menu **Go Live** → `/seller/live`.
- [ ] Seller Home **Go Live** / **Manage live rooms** links.
- [ ] No CTA promises “go live” without a path to fix blockers.

### Host console — start-live block

- [ ] Open `/seller/live/[roomId]/console` (or equivalent host surface).
- [ ] **Start live** / go-live action calls `PATCH /api/live-rooms/[id]` with `action: "start"`.
- [ ] When readiness false: request fails with `issues` (or UI pre-blocks); room stays scheduled.
- [ ] When readiness true: start succeeds; room status becomes live.

---

## 3. Mobile QA

### Seller Studio overview

- [ ] `SellerHQPremiumBanner` phase matches Connect status (guest / become / finish / ready).
- [ ] Payout card badge and copy match `/api/stripe/connect/status`.
- [ ] When ship-from missing, **Ship-from setup card** visible on Overview.
- [ ] **Quick Launch → Schedule Vault Event** — if gated, alert shows readiness message; Stripe step opens onboarding; ship-from step switches to Overview.

### Ship-from setup card

- [ ] Loads existing address from `GET /api/account/seller` (Bearer).
- [ ] Save posts `PATCH /api/account/seller`; success alert; `liveReadiness` refresh runs.
- [ ] Incomplete fields show validation before submit.

### Vault Events tab

- [ ] Block banner shows first readiness issue (payouts or ship-from), not generic copy only.
- [ ] **Schedule Vault Event** FAB disabled when `liveGate.blocked`.
- [ ] Tapping FAB while blocked runs `onBlockedSchedule` (alert + correct tab/onboarding).
- [ ] Event cards open `SellerHostRoom` (command center).

### Schedule modal

- [ ] Submit blocked with alert when `liveGate.blocked`.
- [ ] Successful schedule offers **Enter command center** → host room.
- [ ] Server errors surface API message (including readiness `issues` on start, if applicable).

### Quick Launch schedule

- [ ] Same gating as Vault Events FAB (see Overview quick launch).

### Host room — Go Live button

- [ ] `SellerHostRoomScreen` loads readiness on mount.
- [ ] **Go live** shows `Finish setup` alert with `issues[]` when blocked.
- [ ] When ready, go live + stream provision succeed.

### App foreground refresh after Stripe return

- [ ] Complete Connect in auth session → lands on `/mobile/stripe-connect-return`.
- [ ] Return to app (AppState **active**): Connect status + live-readiness refresh without kill/reload.
- [ ] Post-onboarding alert reflects Complete / Ready / still pending appropriately.

---

## 4. Stripe Connect

### Start onboarding

- [ ] **Web:** Seller Home embed or `POST /api/seller/stripe/onboard` redirect.
- [ ] **Mobile:** `openStripeConnectOnboarding` → `POST /api/stripe/connect/create-onboarding-link` → in-app browser.

### Return URL

- [ ] Mobile hosted onboarding `return_url` / `refresh_url` base: `{SITE}/mobile/stripe-connect-return`.
- [ ] Auth session completes on success redirect; user can close browser tab.

### Refresh URL (expired link)

- [ ] Open `{SITE}/mobile/stripe-connect-return?refresh=1`.
- [ ] Copy explains link expired and to reopen onboarding from the app (no dead end).

### Status sync after completion

- [ ] `GET /api/stripe/connect/status` shows updated `can_host_live_sales` / `payouts_ready` / `onboarding_ui_status`.
- [ ] Web Seller Home polling / reload picks up `stripeOnboardingComplete`.
- [ ] Mobile `refreshSellerConnectAfterOnboarding` + `useSellerLiveReadiness` refresh.

### Retry from app

- [ ] **Finish Seller Setup** / **Set up payouts** can reopen onboarding after dismiss or refresh link.
- [ ] Repeated attempts do not strand user (clear error if Stripe 503 / not configured).

---

## 5. Shipping readiness

- [ ] Missing ship-from: `checks.hasShipFromAddress === false`; `canGoLive === false`.
- [ ] Issue text mentions shipping address / labels (see readiness `issues[]`).
- [ ] **Web:** `PATCH /api/account/seller` with ship-from fields (cookie session).
- [ ] **Mobile:** same `PATCH` with `Authorization: Bearer` (Supabase JWT).
- [ ] After save, `GET /api/seller/live-readiness` returns `canGoLive: true` (when Stripe also complete).
- [ ] Schedule Vault Event (web + mobile) unlocks without app restart.
- [ ] Listing-level shipping profile is **recommended** for labels but does **not** block `canGoLive` (per `live-show-readiness.ts`).

---

## 6. Server / API validation

Run as the test seller. Record status codes and body snippets in notes.

### `GET /api/seller/live-readiness`

- [ ] **Web:** cookie session → `200`, body includes `canGoLive`, `issues`, `checks`.
- [ ] **Mobile:** `Authorization: Bearer <access_token>` → same shape.
- [ ] When Stripe not configured in env, Stripe checks relaxed (document actual env).
- [ ] When live marketplace disabled, `503` + `LIVE_COMING_SOON` (if applicable).

### `GET /api/account/seller`

- [ ] **Web:** cookie → `200`, `seller`, `readiness`, `stripePlatformConfigured`.
- [ ] **Mobile:** Bearer → `200` (same payload).

### `PATCH /api/account/seller` (ship-from)

- [ ] Incomplete body → `400` + `Please complete your address.`
- [ ] Valid body → `200` + `readiness` + `message: Shipping address saved.`

### `PATCH` start-live — `PATCH /api/live-rooms/[id]` `{ "action": "start" }`

- [ ] Readiness false → `4xx` with `issues` array (no silent success).
- [ ] Readiness true → room transitions to `live`.

### Auth matrix

| Endpoint | Web (NextAuth cookie) | Mobile (Bearer) |
|----------|----------------------|-----------------|
| `/api/seller/live-readiness` | [ ] | [ ] |
| `/api/account/seller` GET | [ ] | [ ] |
| `/api/account/seller` PATCH | [ ] | [ ] |
| `/api/stripe/connect/status` | — | [ ] |
| `/api/live-rooms/*` (host) | [ ] | [ ] |

---

## 7. Manual sign-off table

Fill **Pass / Fail** only after both platforms are checked for that row (or mark N/A with reason).

| Area | Web result | Mobile result | Notes | Pass / Fail |
|------|------------|---------------|-------|-------------|
| Logged out gating | | | | |
| New seller (no Stripe) | | | | |
| Stripe incomplete | | | | |
| Payouts OK, no ship-from | | | | |
| Fully ready (`canGoLive`) | | | | |
| Live-enabled (existing room) | | | | |
| Seller Home / Studio banner | | | | |
| Vault HQ / Vault Events gating | | | | |
| Schedule vault event | | | | |
| Go Live / host entry | | | | |
| Host console start-live block | | | | |
| Stripe onboarding start | | | | |
| Stripe return URL | | | | |
| Stripe refresh URL copy | | | | |
| Post-Stripe status sync | | | | |
| Ship-from save + readiness refresh | | | | |
| `GET /api/seller/live-readiness` | | | | |
| `GET/PATCH /api/account/seller` | | | | |
| Bearer auth from mobile | — | | | |
| Cookie auth from web | | — | | |

**Sign-off**

- QA lead: ____________  Date: ____________
- Engineering: ____________  Date: ____________

---

## 8. Final launch gate

**Seller Go Live readiness is not signed off** until **all** of the following are true on **both web and mobile**:

1. **Stripe + ship-from readiness** — `GET /api/seller/live-readiness` returns `canGoLive: true` and `issues: []` for an approved test seller persona.
2. **Schedule path** — Approved sellers can **schedule** a vault event without dead-end CTAs; blocked sellers see **actionable** copy (payouts and/or shipping) and a clear next step.
3. **Start live path** — Approved, ready sellers can **enter the host / command center** and **start live** successfully; unready sellers are blocked at go-live with the same readiness rules as the API.
4. **Stripe return flow** — Mobile return and refresh URLs behave correctly; status syncs after onboarding without requiring an app reinstall or hard refresh.
5. **Parity** — No case where mobile allows schedule/go-live while web readiness (or API) would block, or vice versa, except during brief post-Stripe propagation windows (must recover via refresh / foreground).

If any row in **§7** is **Fail**, do not mark Go Live readiness complete. Fix, re-run affected sections, and update this checklist date.

---

## Quick API snippets (optional)

```bash
# Live readiness (replace TOKEN and BASE)
curl -sS -H "Authorization: Bearer TOKEN" "$BASE/api/seller/live-readiness" | jq .

# Seller account (mobile)
curl -sS -H "Authorization: Bearer TOKEN" "$BASE/api/account/seller" | jq '.readiness'

# Ship-from patch (mobile)
curl -sS -X PATCH -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{"shipFromStreet":"1 Test St","shipFromCity":"Austin","shipFromState":"TX","shipFromZip":"78701","shipFromCountry":"US"}' \
  "$BASE/api/account/seller" | jq '.readiness.canGoLive'
```
