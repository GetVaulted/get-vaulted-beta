# Get Vaulted — Financial Reconciliation Audit (Phase 1 Report)

**Date:** 2026-08-10
**Status:** Read-only audit. No financial logic was changed to produce this report.
**Scope:** Orders, payments, Stripe integration, payouts, shipping/label finance, refunds, disputes, tax, tips, credits, and every admin-facing financial total currently shown to the business owner.

---

## Executive summary

**Audit status: DOES NOT RECONCILE.**

The codebase already contains a surprising amount of real reconciliation infrastructure — an actual Stripe Balance Transaction puller (`stripe-balance-reconciliation.ts`), a 15-minute Stripe↔DB reconciliation cron (`stripe-reconciliation.ts`), and a real per-order Stripe charge ledger (`stripe-charge-ledger.ts`) that captures `balance_transaction.fee`, `.net`, and application fee. The problem isn't a total absence of Stripe truth — it's that **the admin dashboard the owner is actually looking at doesn't use any of it.**

Three separate, inconsistent engines compute "GMV" / "gross sales" / "processing fees" today, and the one that matches the owner's numbers exactly (`admin-reconciliation.ts`) is a pure database aggregation with **zero calls to Stripe** and a **confirmed, self-documented date-basis bug**: it buckets orders by `Order.createdAt`, not by when money actually moved, while the Stripe export the owner compared against is activity-dated. That single structural issue is the best-supported explanation for all three observed dollar gaps (gross sales, processing fees, tax) and the order-count gap, and it is compounded by two secondary, confirmed issues: a processing-fee estimate fallback that doesn't match Stripe's real per-charge fee, and a Texas sales-tax fallback that can diverge from Stripe's own Tax product records.

Below is the full audit. Section 10 walks through the owner's exact numbers. Section 12 proposes a sequenced implementation plan (Phases 2–18 of the original request) — **nothing in that plan has been started.**

---

## 1. Current architecture

Next.js 15 / Prisma / Supabase Postgres, Stripe Connect **destination charges** (buyer pays the platform, platform auto-transfers the seller's share to their Connect account at charge time), Shippo for shipping labels, PayPal as an alternate seller payout rail. Marketplace and live-show commerce both write into the same `Order` table; live tips and in-progress layaway installments are the two carve-outs that live partly or wholly outside `Order` (see §2).

**Three parallel engines currently compute "the" financial totals, and they disagree with each other, not just with Stripe:**

| Engine | File | Surfaced at | GMV definition | Date field | Stripe cross-check |
|---|---|---|---|---|---|
| **A** (matches the owner's numbers) | `web/src/lib/admin/admin-reconciliation.ts` | `/api/admin/reconciliation` (legacy JSON) + the CSV export button on `/admin/reconciliation` | item price only | `Order.createdAt` | **none** |
| **B** (what the `/admin/reconciliation` *page* actually renders on screen) | `web/src/lib/admin/financial-ledger-loaders.ts` → `order-financial-ledger.ts` | `/admin/reconciliation` tabs (Overview/Orders/etc.) | full buyer charge (item+shipping+tax) — **opposite of Engine A's definition, same word "GMV"** | `Order.createdAt` | partial (Stripe tab only) |
| **C** (dashboard tiles) | `web/src/lib/admin/admin-finance-aggregates.ts` | `/admin/finance` | item price only, no date filter at all (most-recent 5,000 rows, uncapped range) | n/a for summary; `createdAt` for charts | none |

The export button on the reconciliation page calls Engine A while the tiles on that same page render Engine B — **the number a person sees and the number in the CSV they download from the same screen can legitimately be different numbers, computed differently, before Stripe even enters the picture.** This is worth fixing regardless of the Stripe-matching work.

A genuinely Stripe-verified reconciliation tool already exists — `web/src/lib/admin/stripe-balance-reconciliation.ts`, which pulls real `stripe.balanceTransactions.list()` data and computes variance — but it lives on a separate tab and is not what produces the owner's headline numbers.

---

## 2. Current financial tables/models

No dedicated `Payment`, `Refund`, `Dispute`, or `BalanceTransaction` Prisma model exists. Financial state is spread across:

- **`Order`** (schema.prisma ~1779–1971) — the center of the system. Stripe identifiers: `stripePaymentIntentId`, `stripeCheckoutSessionId`, `stripeChargeId`, `stripeBalanceTransactionId`, `stripeTransferId`, `stripeTaxCalculationId`, `stripeTaxTransactionId`/`ReversalId`. Fee fields: `stripeProcessingFeeCents` (actual, from `balance_transaction.fee`), `stripeApplicationFeeCents`, `stripeNetCents`, `platformFeeCents` (immutable snapshot), `platformFeePercentApplied`. Tax fields: `taxUsd`, `taxAmountCents`, `taxRefundedCents`, `taxProvider`, `taxJurisdictionState`. Shipping/label fields: `shippingLabelCostCents`, `shippingLabelCostReversedCents`, `shippingLabelCostReversalId`. Payout fields: `payoutStatus` (enum: pending/held/delivery_confirmed/fast_payout_ready/label_payout_ready/instant_payout_ready/paid_out/blocked/manual_review), `payoutEligibleAt`, `payoutReleasedAt`, `processorTransferId`. Credit fields: `referralCreditAppliedUsd`, `platformCreditAppliedUsd`, `sellerCreditShortfallCents`/`TransferId`. `paymentStatus` is a **free-form string, not an enum** ("paid", "refunded", "chargeback", "layaway_completed", etc.). **There is no `paidAt` column** — this is the root of the date-basis bug (§5).
- **`OrderRefundRequest`** — buyer/seller/admin refund workflow state machine; only `stripeRefundId` as a Stripe field. No refund amount breakdown (tax/shipping/item) is separately persisted.
- **`LayawayPayment`** — installment payments; captures `stripeCheckoutSessionId`/`stripePaymentIntentId` only, **no fee/charge/balance-transaction fields at all**.
- **`LiveTip`** — fully separate from `Order` by design ("no platform fee, no GMV tier impact"). No fee-capture fields exist on it either.
- **`ShipmentPackage`** / **`ShipmentLabelFinance`** — per-Shippo-transaction label cost/clawback/credit ledger (already deeply audited this session; see the `shipmentPackageId` unique-constraint fix shipped today).
- **`ReferralCredit`** / **`PlatformCredit`** — Vault credit ledgers.
- **`SellerPayoutMetrics`**, **`PayoutEligibilityAuditLog`** — seller-level payout tier/standing metrics and a DB-only decision trail (never diffed against Stripe).
- **`ProcessedStripeEvent`**, **`WebhookEventLog`** — webhook idempotency/audit, not structured financial data.
- **`DisputeEvidenceBundle`** — admin evidence-package metadata only; not a dispute-amount ledger.

---

## 3. Current Stripe flow

1. **Charge creation** (`payments.ts`, `stripe-charge-order-saved-pm.ts`, `live-payment-pipeline.ts`, `layaway.ts`): builds a destination charge via `connectCheckoutPaymentIntentData()` (`stripe-tax.ts`). The seller's Connect transfer `amount` is computed **at this moment** using an **estimated** Stripe fee (2.9% + $0.30 — see §6), because the real fee doesn't exist yet.
2. **Webhook** (`web/src/app/api/stripe/webhook/route.ts` → `processStripeWebhookEvent`): `checkout.session.completed` / `payment_intent.succeeded` → `finalizeStripeMarketplaceOrderPaid()` writes `paymentStatus="paid"` and tax fields (from Stripe Tax API), but **not** charge/fee/transfer fields yet.
3. **Post-payment ledger backfill** (`stripe-charge-ledger.ts`): fires asynchronously after step 2, retrieves the PaymentIntent with `latest_charge.balance_transaction` **expanded**, and writes the real `stripeChargeId`, `stripeBalanceTransactionId`, `stripeProcessingFeeCents` (= `balance_transaction.fee`, actual), `stripeNetCents` (actual), `stripeApplicationFeeCents`, `stripeTransferId`. **This only fills currently-null columns** (`force` defaults false) — it never overwrites a value already present, even if wrong.
4. **Tax**: real Stripe Tax Calculation/Transaction API by default; a **hardcoded 8.25% local fallback** exists for Texas (and silent $0 for other states) if Stripe Tax errors (§6).
5. **Refunds** (`order-refund-request.ts`): full-refund-only (`fullRefundAmountCents` = item+shipping+tax, no proration wired up despite a `proratedRefundAmountCents` helper existing unused); `stripe.refunds.create({ reverse_transfer: true })` claws back the seller's Connect transfer. **The platform's own application fee is never refunded** — flagged explicitly in-code as an unresolved business-rule assumption.
6. **Disputes**: `charge.dispute.created`/`closed` freeze/resolve `payoutStatus`; the dispute *amount* used everywhere in reporting is just `Order.totalUsd`, never the real `Dispute.amount` from Stripe.
7. **Payouts**: Connect accounts are forced to `manual` payout schedule; the app explicitly calls `stripe.payouts.create()` itself (`stripe-seller-payout.ts`) — nothing is automatic. PayPal is a symmetric alternate rail.

---

## 4. Current reconciliation formulas

**Engine A** (`admin-reconciliation.ts`, matches the owner's report):
```
Paid orders   = count(Order where paymentStatus ∈ {paid, layaway_completed} AND createdAt >= now-30d)
GMV           = Σ itemPriceUsd                       (same filter)
Gross sales   = Σ totalUsd  (item + shipping + tax)   (same filter)
Processing    = Σ [stripeProcessingFeeCents if set, else round(totalUsd × 2.9% + $0.30)]
Sales tax     = Σ taxUsd
Refunds       = Σ totalUsd where paymentStatus ∈ {refunded, chargeback}   -- separate bucket, does not reduce GMV/gross sales
```
No Stripe API call anywhere in this path.

**Engine B** (`order-financial-ledger.ts` / `financial-ledger-loaders.ts`, what's on screen): same `createdAt` window, but calls its "GMV" the *full customer charge* (opposite of Engine A), and does label per-order fee source as `"actual"` vs `"estimated"` — better hygiene, same underlying estimate formula, same date field.

**Engine C** (`admin-finance-aggregates.ts`, `/admin/finance` tiles): item-only GMV like Engine A, but **no date filter at all** on the summary (capped at 5,000 most-recent rows) — not actually a "30-day" figure despite living next to date-ranged charts.

---

## 5. Current date logic — confirmed structural bug

`Order` has **no `paidAt` column**. Every engine filters by `createdAt`. This is not an oversight I'm inferring — it's stated in the code itself:

- `financial-ledger-range.ts:141-144`: *"Order has no `paidAt` column... Use `createdAt` as the ledger clock until a charge-time timestamp is added to Order."*
- `admin-reconciliation.ts` assumptions list: *"Orders are grouped by creation date (createdAt), not by payment or refund event date."*

Stripe's own exports are activity-dated (when the charge/refund actually posted). Any order created near the 30-day boundary but paid, refunded, or disputed on a different date lands in a different bucket in Get Vaulted than in Stripe. Live-show auction wins (deferred payment after the show), saved-card payment retries, and refunds processed days after the original sale are the most likely real-world triggers for this in this app specifically, since all three create a gap between `createdAt` and actual payment-event time.

---

## 6. Where estimates are used (and whether money actually moves on them)

| Estimate | Formula | File | Live money-moving, or reporting-only? |
|---|---|---|---|
| Stripe processing fee | `round(charge × 2.9% + $0.30)`, env-overridable | `seller-payout-estimate.ts` | **Both.** Used to size the real Connect transfer amount at charge time (`stripe-tax.ts:connectCheckoutPaymentIntentData`, called from every buy-now/pay-order/layaway/live-purchase checkout path) *and* as the reporting fallback when `stripeProcessingFeeCents` is null. The transfer amount is never retroactively corrected once the real fee is known. |
| Texas sales tax | flat 8.25% of item+shipping | `stripe-tax.ts:84,94-98` | Live — genuinely charged to the buyer — but with no matching Stripe Tax Calculation/Transaction record, so it exists in Get Vaulted's tax totals without necessarily existing in Stripe's own tax reporting. |
| Dispute/chargeback amount | assumed = `Order.totalUsd` | `order-financial-ledger.ts:427` | Reporting-only, but wrong whenever a dispute doesn't cover the full order. |
| Dispute/chargeback counts (seller-risk dashboards) | `Order` count proxy, not Stripe Disputes API | `admin-finance-aggregates.ts:64-66,168-170` | Reporting-only, explicitly marked `chargebacksDisputesEstimated: true` with a `TODO` in the code. |
| "Already bank-paid" bulk detection | heuristic comparing estimated seller net vs Stripe Connect balance, 10%/$5 slack | `reconcile-stripe-bank-payouts.ts:49-103` | **Writes `payoutStatus="paid_out"` with a synthetic transfer id** based on an estimate, not a real Stripe payout object. |
| Platform fee snapshot on credit-discounted orders | computed on **pre-credit** price | `referral-credit-payout.ts` via `resolveCheckoutApplicationFeeCents` | Reporting value only, but overstates real Stripe-collected `application_fee_amount` on any order where a Vault/referral credit was applied. |

---

## 7. Where actual Stripe values already exist (the good news)

This is not a green-field project — real infrastructure to build on already exists:

- `stripeChargeId`, `stripeBalanceTransactionId`, `stripeProcessingFeeCents` (= actual `balance_transaction.fee`), `stripeNetCents` (= actual `.net`), `stripeApplicationFeeCents`, `stripeTransferId` — captured via `stripe-charge-ledger.ts`'s expanded PaymentIntent retrieval, on essentially every order.
- Real Stripe Tax Calculation/Transaction IDs and amounts for the non-fallback tax path.
- `stripe-balance-reconciliation.ts` already pages through real `stripe.balanceTransactions.list()` data, categorizes every transaction type, and computes a variance — it's simply not wired into the headline dashboard.
- `stripe-reconciliation.ts` cron already runs every 15 minutes reconciling PaymentIntents/Charges/Refunds/Disputes against the DB (explicitly does **not** cover Connect payouts/transfers — a documented gap, not an oversight).
- Idempotency keys are used correctly almost everywhere real money moves (bank payouts, refunds, label clawbacks, credit-shortfall transfers) — duplicate-transfer risk is low except for one PayPal truncation issue (§8).

---

## 8. Identified reconciliation bugs (confirmed in code)

| # | Bug | File | Severity |
|---|---|---|---|
| 1 | Reconciliation buckets by `Order.createdAt`, not payment/refund/payout event time | `admin-reconciliation.ts`, `financial-ledger-range.ts` | **Critical** — root cause of the reported gap |
| 2 | Three engines define "GMV"/"gross sales" inconsistently (Engine A vs B disagree on whether tax/shipping are included) and disagree with each other on-screen vs in export | `admin-reconciliation.ts` vs `order-financial-ledger.ts` | **High** |
| 3 | Processing-fee total blends actual + 2.9%/$0.30-estimated rows with no visibility into which fraction is real (Engine A/C) | `admin-reconciliation.ts`, `admin-finance-aggregates.ts` | **High** |
| 4 | Seller Connect transfer amount is sized from the fee **estimate** at charge time and never reconciled/corrected once the real fee is known | `stripe-tax.ts`, `seller-payout-estimate.ts` | **High** (small, permanent per-transaction platform gain/loss) |
| 5 | Platform application fee is never refunded on a refund/chargeback — kept in full regardless | `order-refund-request.ts`, flagged in `admin-reconciliation.ts:105-108` | **High** (undecided business rule, real revenue-recognition impact) |
| 6 | Platform fee snapshot (`platformFeeCents`) computed on pre-credit price, overstating real Stripe `application_fee_amount` on any credit-discounted order | `referral-credit-payout.ts` | **Medium** |
| 7 | Credit-shortfall transfers (`sellerCreditShortfallCents`) are real Stripe money out but appear in **zero** revenue/cost reports reviewed | `fund-seller-credit-shortfall.ts` | **Medium** |
| 8 | Texas tax fallback (8.25% flat) can exist in Get Vaulted's tax totals with no corresponding Stripe Tax Transaction | `stripe-tax.ts:84` | **Medium** |
| 9 | Untaxed-order path reduces `application_fee_amount` by referral credit only, never by platform/Vault credit | `sales-tax-charge.ts:124-163`, all its call sites | **Medium** |
| 10 | `persistOrderStripeChargeLedger` only fills null columns (`force` defaults false) — a bad backfill value, once written, never self-heals | `stripe-charge-ledger.ts` | **Medium** |
| 11 | Dispute/chargeback dollar amount assumed = full order total, not Stripe's actual `Dispute.amount` | `order-financial-ledger.ts:427` | **Medium** |
| 12 | Dispute/chargeback counts on seller dashboards are a DB proxy, not the Stripe Disputes API, and are labeled as such in-code (`TODO`) | `admin-finance-aggregates.ts` | **Low-Medium** |
| 13 | "Bulk already-paid" bank-payout detection marks orders `paid_out` from an estimate-based heuristic with a synthetic transfer id, with no real Stripe payout object backing it | `reconcile-stripe-bank-payouts.ts` | **High** (direct risk of mis-attributing which orders were actually paid) |
| 14 | Refund-after-payout and dispute-lost-after-payout code paths never check whether the seller's Connect balance can actually absorb the reversal (no `stripe.balance.retrieve` verification) | `order-refund-request.ts:883-896`, `payments.ts:2994-3082` | **High** |
| 15 | PayPal payout `sender_batch_id` (`gv-order-${orderId}`) can truncate to 30 chars, risking idempotency-key collision between two different orders | `paypal.ts:39` | **Low** (statistically rare, but a real duplicate/blocked-payout risk) |
| 16 | Instant-payout outstanding-exposure counter is a pure DB counter, never reconciled against actual Stripe Connect balances | `instant-payout-limits.ts` | **Medium** |
| 17 | `/admin/finance` summary has no date filter at all despite sitting next to date-ranged charts (reads most-recent 5,000 rows, uncapped) | `admin-finance-aggregates.ts` | **Medium** (misleading, not wrong data) |

## 9. Suspected reconciliation bugs (plausible, not yet proven against live data)

- The `reconcile-stripe-bank-payouts.ts` heuristic (bug #13) could in principle mis-classify a seller's real bank-payout status in either direction if their cached fee/label-cost fields have drifted — needs a live audit run to confirm actual incidence, not just theoretical risk.
- `LayawayPayment` installments beyond the first one mirrored to `Order.stripePaymentIntentId` may not be individually captured by the Stripe balance reconciliation cross-reference — needs confirmation against real layaway order data.
- Retry-across-candidates patterns analogous to the `ShipmentLabelFinance.shipmentPackageId` bug fixed earlier today may exist elsewhere in the payout/transfer code; none were confirmed in this pass, but the pattern (retry with a different key while reusing a uniquely-constrained field) is worth a dedicated search in Phase 2.

---

## 10. Exact reason the current 30-day totals differ from Stripe

Walking through the owner's numbers:

| Metric | Get Vaulted | Stripe | Gap | Direction |
|---|---|---|---|---|
| Paid/sale orders | 1,086 | ~1,089 (ex-tips) | ~3 | GV under |
| Gross sales | $36,638.08 | $36,820.28 | $182.20 | GV under |
| Processing fees | $1,387.28 | $1,394.38 | $7.10 | GV under |
| Sales tax | $602.06 | $605.28 | $3.22 | GV under |
| Refunds | $501.16 | $501.16 | $0.00 | match |

Every mismatched metric points the **same direction** (Get Vaulted under-reports vs. Stripe) and the magnitudes are internally consistent with a small number of orders — roughly 3 — being counted in Stripe's window but missing from Get Vaulted's `createdAt`-based window (or vice versa, shifted by a few days): $182.20 spread over ~3 orders is a plausible average order size for this shop; 8.25%-ish effective tax on that same $182.20 is in the right range for the $3.22 tax gap; and 2.9%+$0.30-per-order fees on ~3 orders plus the estimate/actual blending in bug #3 is consistent with the $7.10 fee gap. **This is the best-supported single explanation: bug #1 (date-basis mismatch) is the primary driver of all three dollar gaps and the order-count gap simultaneously**, exactly as the owner already suspected.

Refunds matching exactly to the penny is itself corroborating evidence, not a coincidence to dismiss: refunds in this 30-day window apparently didn't straddle the boundary, so that bucket wasn't exposed to the same date-window error — consistent with a boundary-timing cause rather than a broad, systemic miscalculation.

Secondary, confirmed contributors that would compound or slightly obscure the picture even after fixing the date basis: the processing-fee estimate fallback (bug #3/#4) for any order still missing a backfilled actual fee, and the Texas tax fallback (bug #8) for any Texas order that hit a Stripe Tax API failure in the period. Neither can be ruled in or out as *the* cause of these specific gaps without transaction-level matching (Phase 5) — which is exactly why Phase 2–5 (Stripe-as-source-of-truth ledger + matching engine) is the right next step rather than a point patch.

---

## 11. Risk level of each issue

| Severity | Count | Issues |
|---|---|---|
| Critical | 1 | #1 date-basis mismatch |
| High | 6 | #2, #3, #4, #5, #13, #14 |
| Medium | 8 | #6, #7, #8, #9, #10, #11, #16, #17 |
| Low / Low-Medium | 2 | #12, #15 |

Financial exposure is concentrated in #1 (reporting accuracy, not money at risk), #4/#5/#6/#7 (small but real, permanent per-transaction platform gain/loss and unrefunded-fee revenue recognition), and #13/#14 (the only two items where actual seller money could be mis-tracked, not just mis-reported — these should be prioritized alongside the date-basis fix).

---

## 12. Proposed implementation plan (not started)

1. **Add `Order.paidAt`** (and `refundedAt`, `disputedAt`, `payoutPaidAt` if not already reliably derivable) populated from the actual webhook/ledger event, backfilled for historical orders from existing timestamps where possible. This alone should close most of the observed gap — do this first and re-run the owner's 30-day comparison before touching anything else, since it's the cheapest way to confirm the hypothesis in §10.
2. Collapse Engines A/B/C into one reporting library with one unambiguous vocabulary (GMV vs gross sales vs buyer total, defined once), each metric tagged `actual` or `estimated` per row (Engine B's pattern already does this well — standardize on it).
3. Wire the existing `stripe-balance-reconciliation.ts` real balance-transaction puller into the primary dashboard instead of leaving it on a side tab.
4. Build the order-level ledger and transaction-matching engine (Phases 4–5 of the original spec) on top of the now-standardized date fields and actual/estimated tagging.
5. Fix bugs #13 and #14 (the two items with real money-tracking risk, not just reporting risk) before or alongside the ledger work, since they don't require the full ledger to fix.
6. Then proceed through seller ledger audit, payout audit, shipping/clawback audit (largely already instrumented from this session's work), refund/dispute audit, tax audit, and the platform/Stripe balance bridge (Phases 6–11).
7. Only after 1–6 are in place, build `/admin/audit` (Phases 12–15) on top of real, standardized, actual-tagged data rather than re-deriving another parallel engine.
8. Apply the "no estimates when actuals exist" rule (Phase 16) retroactively to bugs #3, #4, #6, #8, #9 identified above.
9. Add the fixture-based test suite (Phase 18) as each piece lands, not as a final step — start with a test that pins down bug #1's fix (paidAt vs createdAt) since that's the highest-value, lowest-risk fix to prove first.

This report has been saved to `web/docs/financial-reconciliation-audit-2026-08.md` and no financial logic has been changed.
