# Live auction — end-to-end QA checklist

Manual launch-readiness verification for **live auction rooms** with **bundled live shipping**, **checkout**, **seller fulfillment**, and optional **escrow**. Run in a **staging** environment with real Stripe test mode, Shippo test token, and production-like env flags unless noted.

Record outcomes and metrics in **§12** (spreadsheet or ticket).

---

## 0. Environment prerequisites

- [ ] `DATABASE_URL` points at disposable staging DB.
- [ ] Stripe test keys; Connect onboarding works for a test seller.
- [ ] Shippo test token (`SHIPPO_API_TOKEN`) if label flows are in scope.
- [ ] Optional: Trustap stub vs live (`TRUSTAP_USE_STUB_RESPONSE`, `ESCROW_PROVIDER`) per escrow test plan.
- [ ] Optional: seed QA personas — `npx tsx scripts/seed-live-auction-qa.ts` (see **§13**).

---

## 1. Seller setup

- [ ] Seller completes **Stripe Connect**; Dashboard shows **charges / payouts enabled** (app stores `stripeOnboardingComplete` when onboarding is done).
- [ ] Seller has a **complete ship-from** address (street, city, state, ZIP, country) under **Account → Seller**.
- [ ] At least one **published `active`** listing has a **live shipping profile**:
  - [ ] `shippingBaseWeightOz` &gt; 0  
  - [ ] `shippingIncrementalWeightOz` ≥ 0  
  - [ ] `shippingCategory` set (raw card / slab / small collectible / custom)  
  - [ ] For label QA: **parcel** weight + dimensions (`parcelWeightOz`, `parcelLengthIn`, `parcelWidthIn`, `parcelHeightIn`) filled where Shippo is required.
- [ ] **If live escrow requires Trustap** (when `TRUSTAP_USE_STUB_RESPONSE=0` and escrow is configured): seller has **`trustapUserId`** linked under **Account → Seller**.
- [ ] **Readiness API:** as the seller (authenticated session), **GET** `/api/seller/live-readiness` returns **`canGoLive: true`** and `issues: []`.  
  - If `canGoLive` is false, use `issues` and `checks` to fix setup (Stripe, Shippo + ship-from, listing shipping profile, Trustap).

**Reference:** `getSellerLiveReadiness` in `src/services/seller/live-show-readiness.ts`.

---

## 2. Start live show

- [ ] Seller opens **Seller → Live** (`/seller/live`), selects room, goes **live** (or starts from host console as your product allows).
- [ ] No blocking **readiness** errors in UI (same rules as §1).
- [ ] **Live room page** loads for seller and viewers: `/live/[roomId]` (and host console `/seller/live/[roomId]/console` if used).
- [ ] **GET** `/api/live-rooms/[id]` does not reject seller for readiness when going live (server enforces readiness where implemented).

---

## 3. Buyer live interaction

- [ ] Buyer account signs in, opens **same live room** URL.
- [ ] Buyer sees **`LiveShippingIndicator`** (bundled shipping panel):
  - [ ] Initially: **“Win your first item to start shipping”** (and subtext *“Bundled rates apply per seller, per show.”* when not compact).
- [ ] Indicator data comes from **GET** `/api/live-shipping/session?liveShowId=<roomId>` (authenticated buyer).

**Reference:** `src/components/live-auction/LiveShippingIndicator.tsx`.

---

## 4. Single item win

- [ ] Host runs one auction item; **buyer wins** (high bidder / sold flow per your build).
- [ ] **Order** row exists: correct buyer, seller, listing, live context if applicable.
- [ ] **`LiveShippingSession`** exists for (buyer, seller, **live show**); order attached to session (`liveShippingSessionId` / session items as implemented).
- [ ] Indicator updates to **base-tier** bundled shipping, e.g. **“Shipping so far: $3.99”** (exact cents depend on tier env / category).
- [ ] Optional: **DB** — `LiveShippingSession.pricingWeightOz` and `shippingCostCents` match expectations for first item.

---

## 5. Multiple item wins (same buyer, same show)

- [ ] Buyer wins **2–5** additional items (same seller, same live room).
- [ ] Indicator shows **incremental** behavior:
  - [ ] **“Next item adds about $X.XX”** when `nextIncrementalCostCents` is available.
  - [ ] **“Items ship together”** subtext.
- [ ] **`pricingWeightOz`** on the session increases with each win (session recalc / `LiveShippingSessionItem` weights).
- [ ] **`shippingCostCents`** increases per tier rules until cap (see §6).

---

## 6. Cap reached

- [ ] Continue wins (or use many small incremental items) until session hits **live shipping cap** (`capReached` / env `LIVE_SHIPPING_CAP_CENTS` / listing cap).
- [ ] **`shippingCostCents`** stops increasing at the cap.
- [ ] Indicator shows **“Max shipping reached 🎉”** and **“Keep buying with no extra shipping”**.
- [ ] Optional: next-item delta UX shows **$0** additional shipping when cap already reached (buyer session UX).

---

## 7. Checkout

- [ ] Buyer completes **pay order** / checkout for won item(s) (Stripe Checkout or escrow checkout per listing threshold).
- [ ] **Shipping charged** on paid order(s) aligns with **session `shippingCostCents`** at checkout time (and `shippingChargedCents` persisted when payment completes, if used).
- [ ] **Stripe:** card payment succeeds in checkout; **Escrow:** Trustap checkout opens and returns; no stuck `pending_payment` beyond expected window.
- [ ] After payment: **`paymentStatus = paid`** (and order `status` as your app defines for paid).

---

## 8. Seller shipping (live shipping dashboard + bundled label)

- [ ] Seller opens **Account → Your sales** (`/account/sales`) — **Live shipments** section loads **GET** `/api/account/live-shipping`.
- [ ] Session **grouped by live show / buyer** as designed; row shows **shipping charged**, **pricing weight**, **cap reached**, **label status**.
- [ ] Before label: **no** `shippoTransactionId` / **Create bundled label** available when **`canCreateBundledLabel`** is true (combined session, all paid eligible orders unlabeled).
- [ ] Click **Create bundled label** → **POST** `/api/account/live-shipping/[sessionId]/create-label`.
- [ ] Verify:
  - [ ] **One** Shippo transaction id shared across **all bundled paid orders** in that session.
  - [ ] **Same `trackingNumber`** on those orders.
  - [ ] **`shippingLabelCostCents`** on each order (even split + remainder on first order).
  - [ ] Dashboard **margin** = charged − label cost (session totals).
- [ ] **Second click:** session already labeled → API returns **existing** label metadata (**no duplicate** Shippo purchase).

**References:** `docs/LIVE_SHIPPING_SYSTEM.md`, `src/services/shipping/bundled-labels.ts`.

---

## 9. Tracking + delivery

- [ ] **Shippo test webhook** (or Shippo dashboard test event) delivers **TRACK_UPDATED** / delivered-style payload to **`POST /api/shippo/webhook`** (signature as configured).
  - [ ] Or **manually** PATCH order / admin path if you only simulate in staging.
- [ ] Orders in bundle: **`fulfillmentStatus`** progresses toward **delivered** (or your final state) per webhook mapping.
- [ ] Buyer sees updated status on **order detail** page.

**Reference:** `mapShippoTrackingToFulfillment` / webhook handler in app.

---

## 10. Escrow (if applicable)

- [ ] Use a **high-value** listing / threshold so checkout uses **escrow** (Trustap) instead of instant card capture where configured.
- [ ] **`escrowStatus`** advances along the expected lifecycle (pending → buyer paid → inspection / delivered / released — exact names per schema).
- [ ] After **delivery** (or inspection window): buyer can **approve** / release per UX.
- [ ] **Funds released** (or provider state) matches success path; seller commerce / notifications if enabled.

---

## 11. Edge cases

| Scenario | Expected |
|----------|----------|
| **`shipAlone` listing** | Order/session uses **ship-alone** bucket; **does not** join default bundle; **separate** label path (`POST .../sales/[orderId]/create-label`) or its own session — not combined bundled label. |
| **Unpaid order** in session | **Excluded** from bundled label purchase; only **paid** + unlabeled + non-ship-alone orders are included. |
| **Already labeled session** | **POST** bundled create-label **returns existing** label; **no duplicate** Shippo transaction. |
| **Seller fails readiness** | **Cannot start** live (UI/API block); **GET** `/api/seller/live-readiness` shows **`canGoLive: false`** with actionable `issues`. |
| **Per-order fallback** | **`POST /api/account/sales/[orderId]/create-label`** still works for eligible single orders when bundled flow is not used. |

---

## 12. Metrics to record (per session / per launch test)

| Metric | How to capture |
|--------|----------------|
| **`shippingChargedCents` vs `shippingLabelCostCents`** | Seller dashboard totals + order rows after payment / after label. |
| **Margin per session** | Dashboard `marginCents` / `marginNegative` flag. |
| **Time to checkout** | Timestamp: first win → payment completed. |
| **Items per buyer** | Count orders / session items for buyer+show. |
| **% buyers hitting cap** | Sessions with `capReached: true` ÷ sessions with checkout. |

---

## 13. Optional — quick QA seed (local / staging)

From repo root (after migrations and `.env` with `DATABASE_URL`):

```bash
npx tsx scripts/seed-live-auction-qa.ts
```

Creates a **seller** (Stripe-ready + ship-from + Trustap placeholder), **buyer**, **auction live room** with **queued live items** linked to **active listings** (shipping profile + parcels). **Copy printed credentials and URLs** into your password manager; sign in as seller and complete any remaining real Stripe Connect step in the browser.

**Does not** replace §1 readiness in production-like env (e.g. live Trustap may still require real linking).

---

## Sign-off

| Role | Name | Date | Pass / Fail |
|------|------|------|-------------|
| QA | | | |
| Seller product | | | |
