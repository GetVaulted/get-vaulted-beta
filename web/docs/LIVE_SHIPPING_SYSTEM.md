# Live shipping system

## Buyer-facing pricing vs carrier labels

- **Buyer-facing live shipping** is a **bundled session** (buyer × seller × show). The estimate is preferably a **Shippo rate** for the package group(s); if Shippo is unavailable, a **weight tier table** (`LIVE_SHIPPING_TIERS_JSON`) is used as the uncapped raw estimate.
- The buyer never pays more than the **platform max of $9.99** (`PLATFORM_LIVE_BUYER_SHIPPING_MAX_CENTS = 999`) per session, even in “calculated” mode or if `LIVE_SHIPPING_CAP_CENTS` is set higher. Hosts may set a **lower** show cap.
- Session fields:
  - `shippingCostCents` — **buyer session total** (after cap / free shipping)
  - `estimatedLabelCostCents` — **uncapped raw** Shippo/tier estimate (used for seller subsidy math)
  - `sellerShippingSubsidyCents` — `max(0, raw − buyerTotal)` when `sellerPaysOverCap`
- **Shippo labels** (per-order or bundled) use each listing’s **`parcelWeightOz`** when set, otherwise **`shippingBaseWeightOz`**, plus **real parcel dimensions** (`parcelLengthIn` × `parcelWidthIn` × `parcelHeightIn`) when all are present. Bundled labels take the **max** of each dimension across included listings, with env defaults if dimensions are missing. A small **`BUNDLE_WEIGHT_BUFFER_OZ`** is added to combined weight for the carrier.

## Capped shipping and margin

- Live sessions can **hit a price cap** (`capReached`). Buyers then pay a flat maximum while more wins nest into the same bundle.
- Once an order has `shippingTermsSnapshotJson`, that purchase’s `shippingPriceUsd` is **immutable** (pay-order checkout must not rewrite it after a later Shippo refresh).
- **Seller margin** (shipping collected vs label cost) can vary: capped buyer totals do not guarantee any particular Shippo rate, so dashboards may show **negative margin** when label spend exceeds what was collected on those orders. That overage is the intended `sellerPaysOverCap` subsidy.

## Bundled label generation

- For a **combined** live session (not `ship-alone:` buckets), sellers can create **one Shippo transaction** for the whole bundle via `POST /api/account/live-shipping/[sessionId]/create-label`.
- **Ship-alone listings** are **excluded** from that combined bundle label (they live in separate sessions / labels).
- **Label cost** from Shippo is attributed for clawback on a **single debit order** in the session; sibling orders get label metadata with `$0` cost attribution so the sum matches the carrier quote without double-charging the seller.
- If **any** order in the session already has a label, the service **returns the existing label** and does **not** purchase again.

## Per-order fallback

- **`POST /api/account/sales/[orderId]/create-label`** and post-payment automation still create **one label per order** when needed (e.g. partial fulfillment, ship-alone, or whenever the bundled flow is not used).
