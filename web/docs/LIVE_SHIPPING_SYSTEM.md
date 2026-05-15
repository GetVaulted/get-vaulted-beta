# Live shipping system

## Buyer-facing pricing vs carrier labels

- **Buyer-facing live shipping** uses each `LiveShippingSession`’s **pricing weight** (accumulated tier weights from session items) to compute what the buyer pays for bundled live checkout. That is a **rate table + cap** model, not the physical package on the scale.
- **Shippo labels** (per-order or bundled) use each listing’s **`parcelWeightOz`** when set, otherwise **`shippingBaseWeightOz`**, plus **real parcel dimensions** (`parcelLengthIn` × `parcelWidthIn` × `parcelHeightIn`) when all are present. Bundled labels take the **max** of each dimension across included listings, with env defaults if dimensions are missing. A small **`BUNDLE_WEIGHT_BUFFER_OZ`** is added to combined weight for the carrier.

## Capped shipping and margin

- Live tiers can **hit a price cap** (`capReached`). Buyers then pay a flat maximum while items keep stacking for pricing-weight purposes.
- **Seller margin** (shipping collected vs label cost) can vary: capped buyer totals do not guarantee any particular Shippo rate, so dashboards may show **negative margin** when label spend exceeds what was collected on those orders.

## Bundled label generation

- For a **combined** live session (not `ship-alone:` buckets), sellers can create **one Shippo transaction** for the whole bundle via `POST /api/account/live-shipping/[sessionId]/create-label`.
- **Ship-alone listings** are **excluded** from that combined bundle label (they live in separate sessions / labels).
- **Label cost** from Shippo is stored in **`shippingLabelCostCents`** on each included order, **split evenly** across eligible bundled orders; any **remainder cents** go on the **first** order so the sum matches the carrier quote.
- If **any** order in the session already has a label, the service **returns the existing label** and does **not** purchase again.

## Per-order fallback

- **`POST /api/account/sales/[orderId]/create-label`** and post-payment automation still create **one label per order** when needed (e.g. partial fulfillment, ship-alone, or whenever the bundled flow is not used).
