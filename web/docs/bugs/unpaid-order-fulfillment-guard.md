# BUG: Unpaid orders could be marked shipped

**Status:** Fixed in code — **manual verification required** before Orders & Fulfillment launch-sign-off  
**Found:** `npm run staging:validate` (2026-05-19)  
**Area:** Orders & fulfillment  

## Summary

Sellers could mark an order **shipped** when `paymentStatus` was `pending_payment` (and other unpaid states), because fulfillment only checked lifecycle `status === "pending" | "paid"`. Auction wins create orders with `status: "pending"` and `paymentStatus: "pending_payment"`.

## Expected

- Seller **cannot** mark shipped or use fulfillment controls unless `paymentStatus === "paid"`.
- API returns **403** with: `Order must be paid before fulfillment.`
- Sales UI hides **Mark shipped**, **Create label**, and tracking actions for:
  - `pending_payment`
  - `failed`
  - `expired`
  - `cancelled` / refunded terminal states

## Fix (implemented)

| Layer | Change |
|-------|--------|
| Guards | `web/src/lib/order-shipping-guards.ts` — `sellerMayMarkOrderShipped`, `sellerMayShowFulfillmentControls` |
| API | `PATCH /api/orders/[id]` — payment gate before `markShipped` |
| UI | `AccountSalesPage` — fulfillment buttons gated on `sellerMayShowFulfillmentControls` |
| Tests | `order-shipping-guards.test.ts`, `staging-green-path.integration.test.ts` |

## Verification

1. `npm run test -- src/lib/order-shipping-guards.test.ts`
2. `npm run staging:validate` (unpaid ship row expects 403)
3. Manual on staging ([orders checklist §3](../orders-fulfillment-qa-checklist.md#orders--fulfillment-manual-staging-checklist)):
   - [ ] `pending_payment` row: no Mark shipped / Create label
   - [ ] API `PATCH` with `markShipped: true` → 403 + message above
   - [ ] Paid order: mark shipped + tracking still works

**Do not mark Orders & Fulfillment launch-signed** until this manual row passes.
