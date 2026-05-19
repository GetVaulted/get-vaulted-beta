# Orders & fulfillment — QA checklist

Manual launch-readiness verification for **buyer order history**, **seller sales dashboard**, **payment states**, **fulfillment / tracking**, and **Shippo label readiness** after **marketplace purchases**, **live sales**, and **auction wins**.

Run in **staging** with Stripe test mode, Shippo test token (when label flows are in scope), and production-like env flags unless noted.

**Related**

- Live auction E2E (win → order): [`LIVE_AUCTION_E2E_QA.md`](./LIVE_AUCTION_E2E_QA.md)
- Seller go-live / ship-from: [`seller-go-live-qa-checklist.md`](./seller-go-live-qa-checklist.md)

**Documentation-only lane** — this file defines QA scope; it does not change product behavior.

**Policy:** No new commerce feature work until the commerce staging gate is closed — see [`LIVE_AUCTION_E2E_QA.md`](./LIVE_AUCTION_E2E_QA.md#commerce-staging-gate).

---

## Release status

| Label | Meaning |
|-------|---------|
| **Staging-signed (commerce loop)** | **No** — requires all three gates in [Commerce staging gate](#commerce-staging-gate). |
| **Launch-signed** | **No** — not granted until staging-signed, [unpaid ship guard](./bugs/unpaid-order-fulfillment-guard.md) verified, and [Final launch gate](#final-launch-gate) met in staging. |

**Tester:** ____________ **Date:** ____________ **Build / env:** ____________

---

## Commerce staging gate

Same gate as live auction — **all three steps must Pass** before the commerce loop is **staging-signed**.

| Step | Gate | Pass/Fail | Date | Build / env | Notes |
|------|------|-----------|------|-------------|-------|
| 1 | `web/.env` + `npm run staging:validate` | **Pass** | 2026-05-19 | integration DB | See [live auction doc § gate](./LIVE_AUCTION_E2E_QA.md#commerce-staging-gate) |
| 2 | Live Auction E2E manual | **Pending** | | | |
| 3 | **Orders & Fulfillment** manual ([checklist below](#orders--fulfillment-manual-staging-checklist)) | **Pending** | | | Includes [unpaid ship guard](./bugs/unpaid-order-fulfillment-guard.md) verify |

**Commerce loop staging-signed** = steps **1 + 2 + 3** all **Pass**. Until then: **not staging-signed**, **not launch-signed**.

---

## Known bug — unpaid fulfillment (fix pending manual verify)

See [`bugs/unpaid-order-fulfillment-guard.md`](./bugs/unpaid-order-fulfillment-guard.md). Code fix is in; **do not launch-sign O&F** until staging confirms unpaid orders cannot ship.

---

## Orders & Fulfillment manual staging checklist

Required green path on staging (step 1 **Pass**; complete step 2 live auction manual first if testing auction win → order):

- [ ] Buyer sees orders (paid, pending, shipped as applicable)
- [ ] `pending_payment` can be completed (web checkout; mobile **Complete payment** → browser)
- [ ] Seller sees paid sale (marketplace / live / auction source)
- [ ] Unpaid orders cannot be fulfilled (UI blocks or API rejects)
- [ ] Seller adds tracking / marks shipped on paid order
- [ ] Buyer sees tracking on order detail

Use §1–§7 below for full coverage; §7 smoke table for per-flow notes.

**Manual pass record (step 3):** Pass/Fail __________ · Tester __________ · Date __________ · Build __________

---

## Naming map

| Surface | Web | Mobile |
|---------|-----|--------|
| Buyer orders | `/account/orders` (`AccountOrdersPage`) | Orders tab → `BuyerOrderDetailScreen` |
| Order detail / pay | `/orders/[orderId]` (`OrderPaySection`, Stripe Checkout) | **Complete payment** → browser `/orders/[orderId]` |
| Seller sales | `/account/sales` (`AccountSalesPage`) | Seller flows via web sales URL or future parity |
| Checkout resume | `POST /api/checkout` (`kind: pay_order`, `buy_now`, etc.) | Same API via web browser bridge |

---

## 0. Environment prerequisites

- [ ] Staging DB + distinct **buyer** and **seller** test accounts (password manager).
- [ ] Stripe test keys; seller Connect onboarding complete; buyer saved card optional (auction auto-charge).
- [ ] Seller **ship-from** address saved (`GET /api/seller/live-readiness` / Seller Home ship-from).
- [ ] Shippo test token when testing label creation (`POST /api/account/sales/[orderId]/create-label`, bundled live labels).
- [ ] Mobile: `EXPO_PUBLIC_SITE_URL` or `EXPO_PUBLIC_WEB_API_URL` points at staging web API host.
- [ ] Optional auction seed: `ALLOW_QA_LIVE_SEED=1 npm run qa:seed-live-auction` (see live auction doc).

---

## 1. Buyer order history

Verify buyers can find orders in the right lifecycle state. Use at least one order per source: **marketplace buy-now**, **live sale**, **auction win**.

### 1.1 Web (`/account/orders`)

- [ ] **Paid** — `paymentStatus: paid`; status progresses toward shipped; pay CTA hidden.
- [ ] **Pending payment** — `paymentStatus: pending_payment` (or `payment_requires_action`); deadline shown when `paymentDeadlineAt` set; link to `/orders/[id]` works.
- [ ] **Cancelled / expired** — `paymentStatus: expired` or order `status: cancelled`; copy does not offer pay; listing recovery rules match product (auction unpaid).
- [ ] **Shipped** — tracking number / URL visible when present; status `shipped`.
- [ ] **Delivered** — status `delivered` (or fulfillment delivered via Shippo webhook); timeline accurate.

### 1.2 Mobile

- [ ] Order list loads for signed-in buyer (Supabase / local repository).
- [ ] Row labels match status (`pending_payment`, `paid`, `shipped`, etc.).
- [ ] **`pending_payment`**: **Complete payment** opens web `webOrderPayUrl(orderId)` in browser (`openWebCommerce.ts`).
- [ ] After pay in browser, return to app and refresh — order shows paid (may require pull-to-refresh / re-open).
- [ ] `touchAuctionPaymentExpiries` path: opening order detail triggers lazy expiry sweep via `GET /api/account/orders` (Bearer) when configured.

---

## 2. Seller sales dashboard

Verify sellers see all commerce sources and correct next actions.

### 2.1 Web (`/account/sales`)

- [ ] **Marketplace sale** — buy-now order appears with buyer, amount, listing title, source metadata.
- [ ] **Live sale** — order tied to live context (`liveRoomItemId` / show) when applicable.
- [ ] **Auction sale** — order after host mark sold; `pending_payment` or `paid` per auto-charge outcome.
- [ ] **Pending payment** — row shows wait state / deadline; `sellerNextActionForOrder` → `wait_buyer_payment` (no label CTA).
- [ ] **Paid** — label / ship CTAs available when ship-from complete.
- [ ] **Shipped / delivered** — tracking visible; **Track** link when `trackingUrl` set; delivered milestone when supported.

### 2.2 Seller hub cross-links

- [ ] `/account/seller` links to sales; recent order snippets consistent with sales table.
- [ ] Expired auction recovery panel appears for eligible unpaid auction listings (if in scope).

---

## 3. Payment states

Persisted `paymentStatus` values (see `web/src/services/payments.ts`). UI may label `failed` as “Failed”.

| State | DB value | Buyer expectation | Seller expectation |
|-------|----------|-------------------|-------------------|
| Pending | `pending_payment` | Pay before deadline | Wait for payment |
| Requires action | `payment_requires_action` | Complete 3DS / auth in checkout | Wait |
| Paid | `paid` | Await shipment | Create label / ship |
| Failed | `failed` | Retry pay from order page | No fulfillment |
| Expired | `expired` | Cannot pay; recovery copy | Recovery / relist tools |
| Refunded | `refunded` | Refund confirmed | No further ship |

### Checks

- [ ] **pending_payment** — checkout `kind: pay_order` succeeds; order not duplicated on retry with same session.
- [ ] **paid** — Stripe webhook or auto-charge sets paid; inventory / listing state consistent.
- [ ] **failed** — `payment_intent.payment_failed` leaves order retryable (not deleted for pay_order).
- [ ] **expired** — `processAuctionPaymentExpiries` on read paths updates past-deadline auction wins; reload order list reflects change.
- [ ] **refunded / cancelled** — if supported in staging, buyer and seller UIs show terminal state (no ship CTA).
- [ ] **Auction mark sold — auto-charge** — PATCH sold returns `{ autoCharge: { outcome: "paid" \| "pending" } }`; notification copy matches outcome (`live-auction-win-payment-notify.ts`).

---

## 4. Fulfillment

- [ ] Seller enters **carrier / tracking** (manual tracking on `PATCH /api/orders/[id]` with `trackingNumber`).
- [ ] **Mark shipped** — `markShipped: true` sets `status: shipped`, `shippedAt`; buyer notification when tracking provided.
- [ ] Buyer sees **tracking** on `/orders/[id]` and order list when `trackingNumber` / `trackingUrl` set.
- [ ] **Delivered** — Shippo tracking webhook or manual transition to `delivered` when enabled (`fulfillment.integration.test.ts` reference behavior).
- [ ] **Unpaid orders cannot be fulfilled** — `pending_payment` / `failed` / `expired` / cancelled: no Mark shipped / Create label in sales UI; `PATCH markShipped` → **403** `Order must be paid before fulfillment.` ([bug doc](./bugs/unpaid-order-fulfillment-guard.md)).

---

## 5. Shipping / Shippo readiness

- [ ] **Ship-from required** — seller without ship-from sees blocked label / ship next action (`add_shipping_info`).
- [ ] **Shipping price on order** — `shippingPriceUsd` / charged shipping reflected in order total at checkout.
- [ ] **Buyer shipping address** — attached on order (checkout shipping payload / `buyerAddressId`).
- [ ] **Label creation readiness** — paid order + ship-from + parcel metadata → `POST /api/account/sales/[orderId]/create-label` returns label URL / transaction id (or clear error).
- [ ] **Bundled live shipping** — live session orders follow bundled vs ship-alone rules (see live auction doc § bundled shipping).
- [ ] **Tracking persistence** — after label purchase, `trackingNumber` / `trackingUrl` survive reload on sales + buyer order views.

---

## 6. API checks

Use browser DevTools, `curl`, or mobile proxy. Confirm auth mode per route.

| Route | Method | Auth (expected) | Purpose |
|-------|--------|-----------------|--------|
| `/api/account/orders` | GET | Cookie **or** Bearer (`resolveAccountUserId`) | Buyer order list; runs `processAuctionPaymentExpiries` |
| `/api/account/sales` | GET | Cookie (session) | Seller sales list + ship-from snapshot; runs expiry sweep |
| `/api/orders/[id]` | GET | Cookie | Order detail JSON (buyer or seller) |
| `/api/orders/[id]` | PATCH | Cookie (seller) | `markShipped`, `trackingNumber` |
| `/api/orders/[id]/charge-saved` | POST | Cookie | Saved-card pay resume |
| `/api/checkout` | POST | Cookie | Checkout session (`pay_order`, `buy_now`, …); runs expiry sweep |
| `/api/account/sales/[orderId]/create-label` | POST | Cookie | Shippo label |
| `/api/account/live-shipping` | GET | Cookie | Live bundled sessions (if testing live wins) |

### Per-route checks

- [ ] **GET `/api/account/orders`** — 401 without auth; 200 with Bearer from mobile; returns `orders[]` with listing thumbnail.
- [ ] **GET `/api/account/sales`** — seller-only rows; includes `paymentStatus`, `paymentDeadlineAt`, `trackingNumber`, `trackingUrl`, `sellerNextAction` hints.
- [ ] **GET `/api/orders/[id]`** — 404 for non-participant; full order for buyer/seller.
- [ ] **POST `/api/checkout`** — `pay_order` returns checkout URL for `pending_payment`; rejects expired with `ORDER_PAYMENT_EXPIRED`.
- [ ] **PATCH `/api/orders/[id]`** — mark shipped only when valid; tracking update on `shipped` orders.
- [ ] **Bearer from mobile** — orders list + live room GET work with Supabase JWT.
- [ ] **Cookie from web** — same flows in browser without Bearer header.

**Gap to watch:** `/api/account/sales` is session-cookie only today; mobile seller parity may require Bearer (track in Notes if blocking).

---

## 7. Manual smoke table

Fill during staging. One row per flow; extend Notes with order ids.

| Flow | Web buyer | Mobile buyer | Seller | API | Pass/Fail | Notes |
|------|-----------|--------------|--------|-----|-----------|-------|
| Marketplace buy-now → paid → ship | | | | | | |
| Marketplace buy-now → abandon checkout | | | | | | |
| Live sale buy-now → paid | | | | | | |
| Auction win → pending_payment → pay | | | | | | |
| Auction win → auto-charge paid | | | | | | |
| Auction payment expired → reload | | | | | | |
| Payment failed → retry | | | | | | |
| Mark shipped + tracking | | | | | | |
| Shippo label create | | | | | | |
| Delivered (webhook or manual) | | | | | | |
| Seller blocked ship when unpaid | | | | | | |

---

## 8. Final launch gate

**Orders & fulfillment is not launch-signed** until all of the following are true in staging:

1. Buyer can **find** orders in history and **pay** `pending_payment` orders (web + mobile pay bridge).
2. Seller can **see paid** orders across marketplace, live, and auction sources.
3. Seller can **ship / track** paid orders (manual tracking and/or Shippo label path).
4. **Unpaid** orders cannot be fulfilled as shipped (UI + API).
5. **Expired** auction payments update on reload via lazy expiry processing.
6. Tracking and totals remain correct after page refresh and cross-device views.

---

## Sign-off

| Milestone | Status |
|-----------|--------|
| Commerce staging gate step 1 (`staging:validate`) | **Pass** |
| Commerce staging gate steps 2–3 (manual) | **Pending** |
| Staging-signed | **No** |
| Launch-signed | **No** (blocked: unpaid fulfillment manual verify) |

| Role | Name | Date | Pass / Fail |
|------|------|------|-------------|
| QA — `staging:validate` (step 1) | | | |
| QA — orders & fulfillment manual (step 3) | | | |
| Ops / fulfillment | | | |
| Product | | | |
