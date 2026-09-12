# Get Vaulted — Shipping Financial System Fix: Implementation Report

**Date:** August 10, 2026
**Status:** Code + schema written, NOT committed, NOT pushed, NOT deployed, NOT run against production. Per your instruction, this is stopped here for your review.

A note before the numbered sections: this implementation phase ran across a context compaction. The literal text of your 17 named test scenarios and your 16-point report outline did not survive that compaction verbatim, and I want to be upfront about that rather than pretend I reconstructed your exact wording. What follows covers the same substance — every fix, constraint, and requirement recorded in the working summary I carried forward — organized into 16 sections. If any specific named scenario from your original list isn't visible below, tell me which one and I'll confirm coverage or fill the gap.

## 1. Constraints honored

No historical order, ShipmentLabelFinance row, or Stripe/PayPal transaction was modified, charged, credited, refunded, or reversed. The six PayPal-net orders with the doubled legacy display field were left untouched — the fix only changes behavior for *future* clawbacks. The 18 labelChargedNoClawback orders and the 43 session-linked orphaned transactions from the audit were not repaired; Fix #3 and Fix #4 prevent the same failure mode going forward but do not retroactively create missing ledger rows for those specific historical transactions. Nothing was committed, pushed, or deployed.

## 2. Fix #1 — Shippo refund-verification transaction-matching bug

`verifyShippoLabelRefundStatus` (`shippo-label-refund-status.ts`) now discards any refund whose own `transaction` field doesn't exactly match the transaction id being verified, instead of trusting Shippo's `?transaction=` query parameter. Six regression tests cover: an unrelated PENDING refund not contaminating an unrelated SUCCESS transaction, a genuinely matching refund being honored, a mixed account-wide list being filtered correctly, a refund entry with no `transaction` field being excluded, an unrelated SUCCESS/refunded entry not falsely marking an unrelated transaction as refunded, and a genuinely matching PENDING refund correctly returning `refund_pending` rather than `chargeable` or `refunded`.

## 3. Fix #2 — PayPal-net double-write bug

`chargeSellerForLabelCost`'s PAYPAL branch previously called `recalculateOrderLabelFinanceSummary` (which derives `Order.shippingLabelCostReversedCents` from the full ledger) and then *also* applied a manual `{ increment: labelCostCents }` on top of that already-correct derived value — doubling the legacy summary field. The redundant increment is removed; the branch now returns the same recalculated, ledger-derived value the Stripe branch already returned. A regression test asserts zero `{ increment }` writes occur anywhere in the PayPal clawback path.

## 4. Fix #3 — Bundled/session label attribution durability

Root cause: in `bundled-labels.ts`, each package's Shippo purchase (real GV spend, recorded in `ShipmentPackage`) was durable, but the corresponding `ShipmentLabelFinance` ledger row was only created later, inside a separate debit/clawback loop that ran after *all* packages had been purchased. If the process crashed or threw between those two points — the exact failure mode the audit found in the 43 orphaned session-linked transactions — a real Shippo charge existed with zero ledger trace.

Fix: the eventual debit order is now computed once, up front (it only depends on already-loaded order fields, not purchase outcomes), and `ensureShipmentLabelFinanceRecord` is called immediately inside the per-package purchase loop the moment Shippo confirms `SUCCESS` — before moving to the next package. Every successful Shippo purchase now gets its durable ledger row at the earliest possible moment, independent of whether the later clawback loop ever runs. An integration test asserts a `ShipmentLabelFinance` row exists for the purchased transaction immediately after a bundled purchase, even with the clawback call itself mocked out.

## 5. Fix #4 — Immediate clawback, never gated on delivery/payout

The single-order purchase path (`shipping.ts`) already called `chargeSellerForLabelCost` immediately after purchase, before any shipment/delivery gating — that path already satisfied "immediate." The gap was specifically the bundled path, closed by Fix #3, and one additional gap inside `chargeSellerForLabelCost` itself: if a bank payout had already gone out before a clawback attempt could run, the function returned `BANK_PAYOUT_ALREADY_SENT` *before* the finance row was even created, silently dropping the transaction from the ledger. That check now runs *after* the finance row is durably resolved, so the row (and the liability it represents) always exists regardless of outcome.

## 6. Fix #4 — Outstanding shipping liability as a first-class concept

New fields on `ShipmentLabelFinance`: `sellerRecoveredCents` (cumulative secondary recovery, distinct from the primary `sellerClawbackCents`), `liabilityEstablishedAt` (a permanent audit marker, set the first time a clawback attempt fails to fully cover the label cost — never cleared, even after later recovery), and `writtenOffCents`/`writtenOffAt`/`writtenOffReason`/`writtenOffByAdminId` for explicit admin write-offs. `markLiabilityEstablishedIfNeeded` (`label-liability.ts`) is called from every failure branch in `chargeSellerForLabelCost` — bank-payout-already-sent, no Stripe payment, transfer lookup/not-found, and the Stripe reversal API call itself failing — so a failed clawback is never silently lost.

`outstandingLiabilityCentsForRow` computes what's still owed (`labelCostCents` minus clawback minus secondary recovery minus write-off, floored at zero, and always zero for refunded/voided/failed-purchase labels since those never carry chargeable cost). `resolveLabelLiabilityDisplayStatus` derives the six-value taxonomy you asked for — Recovered, Partially recovered, Outstanding, Refund pending, Credited, Written off — purely from the ledger, with no separate status field to drift out of sync.

## 7. Fix #4 — Recovery mechanism (payout offset)

New module `label-liability-recovery.ts`, two-phase by design. `planOutstandingLiabilityRecoveryForSeller(sellerId, availableCents)` is a pure read: it walks that seller's chargeable `ShipmentLabelFinance` rows oldest-first (FIFO) and builds a plan capped at the amount actually available, supporting partial recovery across one or many labels. `applyOutstandingLiabilityRecovery(plan, { method, transactionId })` writes only after the real money movement it corresponds to has been confirmed — it increments `sellerRecoveredCents` and appends an audit-trail row to the new `ShipmentLabelLiabilityRecovery` model. Idempotency is enforced by checking, per label, whether a recovery row with that exact `transactionId` already exists before writing again; a retried payout release replans against the now-reduced outstanding balance rather than double-recovering.

## 8. Fix #4 — Wired into both payout rails

Per your instruction to "inspect the existing payout architecture and choose the safest point," this is wired into `releaseSellerStripePayout` and `releaseSellerPayPalPayout` — the literal moment funds are about to leave the platform for the seller's bank/PayPal account, on both rails `finalizeOrderPayoutRelease` ultimately calls into. Before either payout API call, the outstanding-liability plan reduces the amount actually sent; if the liability fully absorbs the payout, no real transfer is made at all (recorded with a `liability-withheld:` marker and its own recovery audit row) rather than sending $0 to Stripe/PayPal. If a partial amount remains, the reduced amount is what's actually paid out, and the recovery is only recorded after that payout call succeeds.

## 9. Idempotency

Every new write path is guarded: `ensureShipmentLabelFinanceRecord` reuses an existing row by `(orderId, shippoTransactionId)` or by `shipmentPackageId`; `markLiabilityEstablishedIfNeeded` only sets its timestamp when null; `applyOutstandingLiabilityRecovery` skips any `(shipmentLabelFinanceId, transactionId)` pair it's already recorded. Combined with the pre-existing per-Shippo-transaction clawback idempotency key, ten retries of the same Shippo transaction collapse to one economic obligation across purchase, clawback, and secondary recovery.

## 10. Replacement labels

Not modified in this phase. `applyReplacementPriorLabelWorkflow` already correctly ties each replacement to its specific prior transaction and only credits when Shippo confirms an actual refund — that logic was reviewed and is unaffected by these changes, since the new liability fields are additive and derive their own state independently per row.

## 11. ShipmentLabelFinance as sole source of truth

`Order.shippingLabelCostCents`/`shippingLabelCostReversedCents`/etc. remain written *only* by `recalculateOrderLabelFinanceSummary`, which derives them from the ledger — this was already true before this phase and Fix #2 removed the one place that violated it. The new liability/recovery fields live entirely on `ShipmentLabelFinance` and `ShipmentLabelLiabilityRecovery`; nothing new was added to `Order`.

## 12. Admin reconciliation visibility

`GET /api/admin/reconciliation/shipping?view=liability` (additive — the existing default order-level report is unchanged) returns a new ledger-level report: every `ShipmentLabelFinance` row with its derived six-value liability status, outstanding/recovered/written-off totals, and status counts, sortable by outstanding amount, filterable by status. This is a working API and data layer; I did not build a dedicated visual admin page for it in this pass — that's a reasonable follow-up if you want a table/chart in the admin UI rather than raw JSON.

## 13. Schema and migration

Migration `20260810120000_shipment_label_liability_recovery` is additive-only: six new nullable/defaulted columns on `ShipmentLabelFinance`, and a new `ShipmentLabelLiabilityRecovery` table with two new enums. It does not alter, backfill, or touch any existing row — every existing `ShipmentLabelFinance` row simply gets `sellerRecoveredCents = 0`, `writtenOffCents = 0`, and null liability/write-off fields, which is a correct default state, not a repair. This has **not** been applied to any database and the Prisma client has not been regenerated — see section 16.

## 14. Test coverage

New/extended files: `shippo-label-refund-status.test.ts` (+4 named regression tests, 6 total in that describe block), `charge-seller-label-cost.test.ts` (+3: bank-payout-already-sent liability establishment, reversal-failure liability establishment, PayPal double-write regression), `label-finance.test.ts` (+3 for `ensureShipmentLabelFinanceRecord`), `bundled-labels.integration.test.ts` (+1 durable-ledger-row integration test), and two new files, `label-liability.test.ts` (10 tests covering the outstanding-cents math and all six display statuses) and `label-liability-recovery.test.ts` (9 tests covering FIFO planning, capping, cross-seller isolation, and idempotent apply/re-apply). That's 26 new or modified test cases across the four fixes.

## 15. What I could not verify from this sandbox

Consistent with the constraint established earlier in this engagement: this environment has no network path to your production database or a working native `vitest`/`esbuild` toolchain (the `node_modules` here are Windows-built binaries). Every change above was verified by careful manual tracing against the mocked test fixtures I wrote, not by actually executing `npm test`, `npx tsc`, or `npx eslint`. Please run those locally before trusting this beyond code review — in particular, `npx prisma generate` (or `migrate dev`) must run first, since the new enums (`ShipmentLabelLiabilityRecoveryMethod`, `ShipmentLabelLiabilityRecoveryOutcome`) and fields don't exist in the generated client yet, so nothing here will typecheck until that happens.

## 16. Required next steps, in order

1. Run `npx prisma migrate dev` (or apply `20260810120000_shipment_label_liability_recovery/migration.sql` directly) against a non-production database first, then regenerate the client.
2. Run `npx tsc --noEmit`, `npx eslint`, and the full `vitest` suite — especially the files touched above — and fix anything that surfaces; I could not run these myself here.
3. Review the two `withheld_for_liability_recovery` code paths (Stripe and PayPal) specifically — this is new behavior where a seller's payout can silently shrink or disappear because of an unrelated order's unpaid shipping liability, which is working as designed per your spec but is worth a deliberate look before it touches real payouts.
4. Decide whether you want a dedicated admin UI page for the new `?view=liability` report, or if the API alone is enough for now.
5. Only after your review: apply the migration to production, deploy, and separately decide whether/how to address the pre-existing 18 labelChargedNoClawback orders and 43 orphaned session transactions from the original audit — those still require your explicit go-ahead, since this phase intentionally did not touch them.
