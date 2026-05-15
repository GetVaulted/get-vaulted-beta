# Vaulted Secure Checkout — production readiness

Use this checklist before treating Trustap-backed escrow as live for high-value orders ($5,000+).

## Trustap & configuration

- [ ] **Real Trustap endpoints** — `TRUSTAP_API_BASE_URL` and `TRUSTAP_ACTIONS_BASE_URL` point at Trustap production (or the correct sandbox) per Trustap docs; no typos or stale hosts.
- [ ] **Webhook username / password** — `TRUSTAP_WEBHOOK_USERNAME` and `TRUSTAP_WEBHOOK_PASSWORD` match what you configured in Trustap (HTTP Basic auth).
- [ ] **Webhook URL registered** — Trustap dashboard sends events to your public `POST /api/escrow/webhook` URL (HTTPS, reachable from Trustap).
- [ ] **`TRUSTAP_USE_STUB_RESPONSE=0`** — Stub mode is **off** in production. With `NODE_ENV=production` and stub enabled, the app **refuses to start** and Trustap provider methods throw if stub is hit.
- [ ] **`ESCROW_ALLOW_APPROVE_FROM_SELLER_SHIPPED=0`** — Buyer release from `seller_shipped` only in dev/test when explicitly set to `1`.

## Database & migrations

- [ ] **Migration baseline / resolution** — Production deploy uses `prisma migrate deploy` (not `db push`). Any DB that was previously `db push`’d has a documented plan (baseline, `migrate resolve`, or rebuild) so the reconciling migration applies cleanly.

## Escrow state machine

- [ ] **Strict transitions** — The app enforces an explicit lifecycle (`pending` → `buyer_paid` → `seller_shipped` → `delivered` → `inspection_period` or `approved` → `funds_released`, plus `ANY` → `disputed` and cancel paths). Webhooks, admin sync, buyer approve, and seller mark-shipped are all validated; invalid transitions return **409** and do **not** update `Order.escrowStatus`. If Trustap ever returns a status that skips a step, resolve with Trustap support or adjust mapping — do not bypass the validator in application code.

## Product verification

- [ ] **Admin escrow controls** — For a test escrow order: sync status from provider, pause release, mark disputed, cancel (where supported), and confirm admin order detail shows transaction id, provider, fee, status, and checkout URL.
- [ ] **High-value manual QA** — At least one order at or above the escrow threshold: buyer checkout, seller ship path, buyer approve / inspection, and webhook-driven updates behave as expected.

## Audit & observability

- [ ] **Escrow audit rows** — After QA, confirm `SellerCommerceEvent` rows with `kind = "escrow_status"` exist for key transitions (webhook, buyer approve / dispute, admin sync, checkout creation) and JSON `body` includes order id, provider, transaction id, previous/new status, source (`webhook` \| `admin` \| `buyer` \| `system`), and timestamp.

## Optional local smoke

- [ ] Run `npm run smoke:escrow` (or `npx tsx scripts/smoke-vaulted-secure-checkout.ts`) with `TRUSTAP_USE_STUB_RESPONSE=1` locally only — seeds a ≥$5,000-path listing and prints a stub checkout URL. **Never** run with `NODE_ENV=production` and stub enabled (the app blocks that at startup and in the Trustap client).
