# Inventory reservation ledger (`LiveAuctionInventoryHold`)

## Purpose

The marketplace model is **one order per listing** (`Order.listingId` is unique). Cross-channel races (live buy-now checkout, HTTP checkout, offer acceptance, auction win + payment) could still interleave **before** an `Order` row exists. The hold ledger blocks a second channel from committing while another buyer has an in-flight reservation on the same listing.

## Lifecycle

| State | Meaning |
| --- | --- |
| `active` | Short-lived reservation; default TTL 20 minutes (`LIVE_AUCTION_INVENTORY_HOLD_TTL_MS`). |
| `consumed` | Linked to a completed purchase path (Stripe / escrow paid) via `orderId`. |
| `released` | Explicitly cleared (checkout abandoned, webhook failure, seller recovery deleting an unpaid order, etc.). |
| `expired` | `expiresAt` passed; cleared by `expireStaleLiveAuctionInventoryHolds()` (cron script `scripts/expire-live-auction-inventory-holds.ts`). |

### Create (`active`)

- **Buy now:** `reserveListingInventoryHoldTx` inside the checkout transaction before `order.create`, plus refresh on the “pending escrow, create session next” reuse path.
- **Offer accept:** reserve before `order.create`, then `consume` after a successful paid order (same transaction).
- **Auction win:** reserve before `order.create`; hold stays `active` until payment succeeds (`consume`) or payment window / webhooks / recovery release it.

### Consume

- **Paid marketplace order:** `finalizeStripeMarketplaceOrderPaid` and `applyEscrowBuyerFundsSecured` call `consumeListingInventoryHoldTx` in the same DB transaction as marking the order paid and the listing sold.

### Release / expire

- Stripe **checkout.session.expired** and **payment_intent.payment_failed** (buy now): release using `orderId` and/or session `metadata` (`listingId`, `buyerId`).
- **Auction payment expiry** (`processAuctionPaymentExpiries`): release for the expired winner’s `listingId` + `buyerId`.
- **Seller recovery** (`offerAuctionToNextBidder`, relist/cancel expired result): release the previous winner’s hold when their `Order` row is deleted.
- **Failed prior buy-now order** (deleted inside checkout tx): release for that listing + buyer before creating a new pending order.

## DB constraints

Postgres **partial unique indexes** (see migration `20260513103000_live_auction_inventory_hold`):

- At most one **`active`** hold per **`listingId`** (non-null).
- At most one **`active`** hold per **`liveRoomItemId`** when `listingId` is null (host-only lots — `reserveHostLiveItemInventoryHoldTx`).

Same buyer calling reserve again **refreshes** `expiresAt` and `source` instead of creating a second row.

## Rollback / operations

- **Deploy:** run `prisma migrate deploy` (migration adds enum + table + indexes). No data backfill required.
- **Rollback:** revert migration in a controlled window; ensure no code paths expect the table. Safer rollback: deploy code that stops creating holds first, drain `active` holds (expire or release), then drop table in a follow-up migration.
- **Cron:** schedule `npx tsx scripts/expire-live-auction-inventory-holds.ts` every 5–15 minutes so abandoned holds free inventory without waiting for user actions.
- **Stuck holds:** query `active` rows past `expiresAt`; if cron is down, run the script manually.

## Remaining gaps

- **Quantity > 1 per listing** is not modeled; holds use `units` default `1` only.
- **Break spots** and other non-`Listing` inventory are **not** covered by listing holds (only `reserveHostLiveItemInventoryHoldTx` for host-only `liveRoomItemId` when integrated).
- **Max proxy / clutch-only paths** do not take a listing hold (bidding is not checkout).
- **Idempotency keys** on holds are optional and not yet wired to HTTP `Idempotency-Key` for checkout.

## Related code

- `src/lib/live-auction-inventory-hold.ts`
- `src/lib/offer-fulfillment.ts`, `src/services/payments.ts`, `src/services/auction-recovery.ts`
