# Live auction — end-to-end QA checklist

Manual launch-readiness verification for **live auction rooms** with **bundled live shipping**, **checkout**, **seller fulfillment**, and optional **escrow**. Run in a **staging** environment with real Stripe test mode, Shippo test token, and production-like env flags unless noted.

Record outcomes and metrics in **Part B §12** (spreadsheet or ticket).

**Related:** Seller go-live readiness — [`seller-go-live-qa-checklist.md`](./seller-go-live-qa-checklist.md) · Post-purchase — [`orders-fulfillment-qa-checklist.md`](./orders-fulfillment-qa-checklist.md)

---

## Release status

| Label | Meaning |
|-------|---------|
| **Beta-ready (engineering)** | Guardrails shipped; lot-phase unit tests pass; beta caveats documented below. |
| **Staging-signed (commerce loop)** | **No** — requires all three gates in [Commerce staging gate](#commerce-staging-gate) to be **Pass**. |
| **Launch-signed** | **No** — do not grant until staging-signed **and** product launch criteria beyond this doc are met. |

**Policy:** No new commerce feature work until the [commerce staging gate](#commerce-staging-gate) is closed. **Beta manual QA is paused** until [local pre-deploy gate](./local-qa-pre-deploy-gate.md) is green on the build you ship.

**Prerequisite:** [Local QA pre-deploy gate](./local-qa-pre-deploy-gate.md) **Pass** → then [beta QA reset](./beta-qa-reset-checklist.md) smoke on `sellerqa` / `buyerqa` (project `xkaaicokjgmpbctfermj`). Do not use legacy `brysmith31`.

---

## Commerce staging gate

Complete **in order**. Record **Pass/Fail**, date, build/env, and notes in the table below and in [`orders-fulfillment-qa-checklist.md`](./orders-fulfillment-qa-checklist.md) § Commerce staging gate.

| Step | Gate | Pass/Fail | Date | Build / env | Notes |
|------|------|-----------|------|-------------|-------|
| L0 | [Local pre-deploy gate](./local-qa-pre-deploy-gate.md) — web + Expo + regression matrix | **Pending** | | | **Required before beta deploy** |
| 0 | [Beta QA reset](./beta-qa-reset-checklist.md) — smoke on deployed beta | **Paused** | | | After L0 green |
| 1 | `npm run staging:validate` (+ `qa:pre-deploy` in Step L0) | **Pass** | 2026-05-19 | local / integration DB | |
| 2 | **Live Auction E2E** — manual ([checklist below](#live-auction-manual-staging-checklist)) | **Pending** | | | After L0 + step 0 |
| 3 | **Orders & Fulfillment** — manual ([orders doc](./orders-fulfillment-qa-checklist.md#orders--fulfillment-manual-staging-checklist)) | **Pending** | | | After step 2 |

**Commerce loop staging-signed** = **L0 + 1 + 2 + 3** all **Pass**. Until then: **not staging-signed**, **not launch-signed**.

### Step 1 — Automated validation

1. Copy `web/.env.example` → `web/.env` and set `DATABASE_URL` or `INTEGRATION_DATABASE_URL` (disposable Postgres).
2. From `web/`:

```bash
npm run staging:validate
```

Harness: `web/src/test/staging-green-path.integration.test.ts`.

### Live Auction manual staging checklist

Run on **beta** (`https://beta.shopgetvaulted.com`) after [beta QA reset](./beta-qa-reset-checklist.md). Seller: `sellerqa@getvaultedtest.com`. Buyer: `buyerqa@getvaultedtest.com`. Two browsers + one mobile device.

- [ ] Seller starts auction room (go live → activate lot → open bidding)
- [ ] Web buyer bids
- [ ] Mobile buyer bids (snapshot refresh after bid)
- [ ] Timer expires without auto-settlement
- [ ] Host marks sold (only settlement path)
- [ ] Winner / payment outcome created (`orderId`, auto-charge or `pending_payment`)
- [ ] Buyer completes payment
- [ ] Seller sees sale in sales dashboard
- [ ] Payment expiry behavior updates correctly on order / room reload

**Manual pass record (step 2):** Pass/Fail __________ · Tester __________ · Date __________ · Build __________

---

# Part A — Live commerce transaction pipeline (E2E hardening)

Validate the full path: **viewer joins → bids → auction closes → winner → checkout → paid order → fulfillment → payout visibility**.

Use **two browsers** (seller host + buyer) and one **mobile device** for parity rows. Do not file UI polish bugs in this pass — only **state, money, and API** correctness.

**Key code references**

| Area | Path |
|------|------|
| Bid API | `web/src/app/api/live-rooms/[id]/items/[itemId]/bid/route.ts` |
| Mark sold / settle | `web/src/lib/live-auction-item-sold-settle.ts`, `items/[itemId]/route.ts` PATCH `sold` |
| Realtime | `web/src/hooks/useRealtimeRoomSubscription.ts`, `web/src/components/live-auction/LiveRoomShell.tsx` |
| Orders / pay | `web/src/lib/offer-fulfillment.ts`, `web/src/services/payments.ts` |
| Mobile bid / pay bridge | `mobile/src/api/liveRoomBuyerRepository.ts`, `mobile/src/lib/openWebCommerce.ts` |

**Tester:** ____________ **Date:** ____________ **Build / env:** ____________

---

## Beta launch caveats (intentional gaps)

These are **product limitations for beta**, not bugs. UX and APIs should surface them clearly.

| Gap | Beta behavior | Where guarded |
|-----|----------------|---------------|
| **Host-settled auction close** | Timer expiry **does not** create an order or charge anyone. Host must **Mark sold** to settle the winner. | Web: `live-auction-lot-phase.ts`, `LiveSaleRoom` / `LiveAuctionRoom` host + buyer copy; mobile host: `VaultPinnedLotCard` |
| **Mobile bidding without full live sync** | Discovery feed uses **API snapshots**, not full Supabase realtime. After each bid, snapshot refreshes; buyers see stale-sync notice + **Open live room in browser**. | `LivePinnedActionBar`, `liveRoomBuyerRepository` |
| **Lazy payment expiry** | `processAuctionPaymentExpiries()` runs on **read paths** (live room GET, orders, checkout POST, seller account/sales), **not** a cron. Expired win payments may linger until someone hits those routes. | `web/src/services/payments.ts`, API routes listed in A4 |

---

## A1. Live room state sync

- [ ] **Current item** — host activates lot; buyer + seller see same title / active id within ~1s (realtime or poll fallback).
- [ ] **Countdown** — `auctionEndsAt` matches server; extension after late bid updates all clients (soft close).
- [ ] **Viewer join/leave** — viewer count stable; no crash on rapid join.
- [ ] **Reconnect** — refresh or airplane mode toggle; room state recovers (poll + `auctionSeq` gap refresh on web).
- [ ] **Sold propagation** — after host marks sold, item leaves active slot; `purchase_completed` / queue updates on buyers.
- [ ] **Mobile parity** — mobile can load room via `GET /api/live-rooms/[id]` (Bearer); bid uses same API as web.

**Known product rule:** Pure `roomType: auction` lots do **not** auto-close on timer alone — host must mark **sold** (timer blocks new bids only).

---

## A2. Bid system

- [ ] **Increments** — bid below `minNextBidUsd` rejected with clear error.
- [ ] **Race** — two buyers bid at once; one gets `409` / concurrent higher bid; UI shows refreshed high bid.
- [ ] **Idempotency** — double-tap bid with same `Idempotency-Key` returns same result (no double leader); web + mobile send header.
- [ ] **Wallet gate** — buyer without card/shipping gets `402` before bid is accepted (when Stripe configured).
- [ ] **Reserve / proxy** — listing proxy bids via marketplace rules; live route rejects `maxProxyUsd` on listing lots (documented).
- [ ] **Extension** — bid inside clutch window extends `auctionEndsAt` (server + UI).

---

## A3. Auction close

- [ ] **Winner** — `resolveProxyAuction` / `lastHighBidderId` matches high bidder after mark sold.
- [ ] **No duplicate winner** — second mark sold → `409` item already sold; single `Order` per listing.
- [ ] **Seller confirmation** — host PATCH `sold` returns `{ ok, orderId, autoCharge }`; item `biddingOpen: false`.
- [ ] **Item lock** — losing bidders cannot bid after close; active item advances per queue rules.
- [ ] **Failed payment recovery** — unpaid win → seller recovery APIs / relist (see `auction-recovery`); buyer order `pending_payment` with deadline.

---

## A4. Checkout flow

- [ ] **Winner timing** — buyer notification reflects auto-charge outcome (paid vs pay within 30m).
- [ ] **Stripe Checkout** — `POST /api/checkout` `kind: pay_order` when saved card unavailable.
- [ ] **Return** — success lands on `/orders/[orderId]`; cancel does not mark paid.
- [ ] **Cancel** — buyer can retry pay from order page.
- [ ] **Inventory** — hold reserved at order create; released on expiry / cancel per holds doc.

---

## A5. Order creation

- [ ] **Seller** — order in `/account/sales` with correct buyer, amount, live show context.
- [ ] **Buyer** — order in buyer history; mobile order detail shows row (pay via web bridge if `pending_payment`).
- [ ] **Shipping** — live win attaches to `LiveShippingSession` when applicable (`shippingPriceUsd` at pay time).
- [ ] **Metadata** — `liveRoomItemId` / listing id preserved for support and labels.

---

## A6. Fulfillment

- [ ] **Mark shipped** — seller fulfillment status advances.
- [ ] **Tracking** — Shippo webhook or manual tracking updates buyer order view.
- [ ] **Delivered** — terminal fulfillment state reachable.
- [ ] **Payout** — Connect seller sees payment in sales / wallet after `paymentStatus: paid` (not blocked by live bid).

---

## A7. Failure recovery

| Scenario | Expected |
|----------|----------|
| WebSocket drop | Poll + reconnect merge; no permanent stale high bid |
| Seller disconnect mid-auction | Bids still validated server-side; host can return and mark sold |
| Buyer disconnect mid-checkout | Order stays `pending_payment` until deadline; can pay when back |
| Payment failure | `payment_failed` / order not paid; buyer can retry |
| Expired auction payment | `processAuctionPaymentExpiries` on order/live GET; listing recovery state |
| Duplicate events | Idempotent bid key; mark sold transaction single order |

---

## A8. Mobile parity

| Flow | Web | Mobile |
|------|-----|--------|
| Place bid | Live room UI → `POST .../bid` | Auction lane CTA → same API (Bearer) |
| Sold / pay state | Realtime + order page | Order detail; **Complete payment** opens web `/orders/[id]` |
| Reconnect | Realtime + poll | Re-open room; refetch snapshot before bid |
| Host mark sold | Seller console | `patchLiveRoomItem` (existing host console) |

- [ ] Mobile bid succeeds against staging API (not Trade Center redirect for auction lanes).
- [ ] Mobile payment for auction win completes via web order page in browser.

---

## A9. Transaction pipeline sign-off

| Step | Web | Mobile | Notes | Pass |
|------|-----|--------|-------|------|
| Join live room | | | | |
| Place valid bid | | | | |
| Concurrent bid handling | | | | |
| Host mark sold | | | | |
| Order created | | | | |
| Auto-charge / pay | | | | |
| Buyer order visible | | | | |
| Seller sales visible | | | | |
| Fulfillment update | | | | |

---

## A10. Transaction launch gate

**Live auction E2E is not signed off** until Part A rows pass on **web and mobile** for at least one full auction win → pay → seller sees paid order. Bundled shipping depth (Part B) can run in parallel but does not replace Part A.

---

# Part B — Bundled live shipping, labels & escrow

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

| Milestone | Status |
|-----------|--------|
| Beta-ready (engineering) | **Yes** |
| Commerce staging gate L0 (local pre-deploy) | **Pending** |
| Commerce staging gate step 0 (beta smoke) | **Paused** |
| Commerce staging gate step 1 (`staging:validate`) | **Pass** |
| Commerce staging gate steps 2–3 (manual) | **Pending** |
| Staging-signed | **No** |
| Launch-signed | **No** |

| Role | Name | Date | Pass / Fail |
|------|------|------|-------------|
| QA — `staging:validate` (step 1) | | | |
| QA — live auction manual (step 2) | | | |
| Seller product | | | |
