# Get Vaulted — Pre-Launch Performance Audit (July 2026)

Scope: Database Performance, API Performance, Web Performance, Mobile App Performance, Live
Auction/Streaming Performance, Media/Image Performance, Background Jobs, Observability for
Performance. Six parallel subagent audits covering `web/` (Next.js + Prisma/Postgres), `mobile/`
(Expo/React Native), and shared infra (Netlify, Stripe, Shippo, AWS IVS, Sentry).

Full regression suite after all fixes: **web 178 test files / 857 tests passing**, **mobile 72
test files / 327 tests passing**, `tsc --noEmit` clean on both.

Total findings across all six audits: **20 Critical, 21 High, 22 Medium, 14 Low** (77 total).
Given the volume, this pass fixed the highest-value, lowest-risk, mechanically-verifiable issues
with regression tests, and documents the rest (mostly larger architectural changes — real
pagination, checkout de-duplication, bid-chain batching, `next/image` migration) as follow-ups
rather than risking blind rewrites of payment- or auction-critical logic.

---

## Fixed this pass

### 1. Missing indexes on `Listing`, `Order`, `Bid` — full scans on the hottest query paths
- **Severity:** Critical
- **Evidence:** `Listing` had no index beyond a `(sellerId, workspaceKey)` unique constraint; `Bid` had none beyond its primary key; `Order` had only `(escrowTransactionId)`, `(liveShippingSessionId)`, `(sellerId, payoutStatus)`. Every marketplace browse query (`status`+`buyingFormat`+`createdAt`), Seller HQ "my listings" (`sellerId`+`updatedAt`), admin listings (`status`+`updatedAt`), bid-chain resolution (`listingId`+`createdAt`), buyer order history (`buyerId`+`createdAt`), and the payment-expiry sweep (`paymentStatus`+`paymentDeadlineAt`) ran as sequential scans.
- **Why it matters / impact:** These are the platform's highest-traffic reads (every marketplace page load, every bid, every order-history view). Sequential scans degrade linearly with table size and will become the dominant source of latency well before other fixes matter.
- **Fix:** Added 10 targeted composite/single-column indexes via `web/prisma/migrations/20260703160000_perf_indexes/migration.sql` (`Listing`: `(status, buyingFormat, createdAt)`, `(sellerId, updatedAt)`, `(status, updatedAt)`, `(category)`; `Bid`: `(listingId, createdAt)`, `(bidderId, createdAt)`; `Order`: `(buyerId, createdAt)`, `(sellerId, createdAt)`, `(status, createdAt)`, `(paymentStatus, paymentDeadlineAt)`).
- **Tests:** `npx prisma validate` + `npx prisma generate` confirm the schema/migration are consistent; no query-behavior test needed (index-only change, verified against existing query call sites).

### 2. Public marketplace browse (`scope=published`, `scope=merch`) and several account list endpoints had no row cap at all
- **Severity:** Critical (marketplace) / Medium (account endpoints)
- **Evidence:** `web/src/app/api/listings/route.ts` ran `findMany` with a heavy seller+images `include` and **no `take`** for the two public marketplace scopes — returning the entire active-listing table (with seller PII) on every request. Same unbounded pattern in `web/src/app/api/account/{watchlist,offers,follows,threads}/route.ts` and `web/src/app/api/listings/[id]/offers/route.ts`.
- **Why it matters / impact:** Response size and DB cost grow unboundedly with catalog/inbox size; eventually causes timeouts/OOM and, for the public scopes, leaks full seller records to any anonymous client.
- **Fix:** Added defensive `take` caps (500 for most, 300 for threads, 1000/20000 for follow lists) as a safety net. **This is not real pagination** — the marketplace UI still fetches "everything" up to the cap and paginates/filters client-side. A cursor-based redesign of marketplace search/browse is flagged below as a recommended follow-up, not attempted here (large, cross-cutting web+mobile change).
- **Tests:** `web/src/app/api/listings/route.published-merch-cap.test.ts`, `web/src/app/api/account/account-list-endpoints-cap.test.ts` — assert every affected `findMany` now carries a positive `take`.

### 3. Mobile `fetchWebApiMobile` had no request timeout
- **Severity:** Critical
- **Evidence:** `mobile/src/lib/fetchWebApiMobile.ts` called plain `fetch` with no `AbortController`/timeout — a dropped or hung connection left the caller's loading state spinning forever.
- **Why it matters / impact:** On flaky mobile networks this is a common failure mode; without a timeout, screens (live bidding, checkout, listing loads) can hang indefinitely with no way to recover except force-quitting the app.
- **Fix:** Added a 15s default timeout via `AbortController`, composed with any caller-supplied `signal` so existing/future cancellation still works; times out with a clear error message instead of hanging.
- **Tests:** `mobile/src/lib/fetchWebApiMobile.test.ts` — verifies a hung connection rejects with a timeout error (using fake timers) and that normal responses are unaffected.

### 4. Mobile local notification inbox grew without bound
- **Severity:** High
- **Evidence:** `mobile/src/platform/notificationStore.ts` unshifted every new notification into a single JSON array persisted to disk/`localStorage`, with no size cap — every write re-serialized an ever-growing file.
- **Why it matters / impact:** Long-lived accounts accumulate thousands of notifications over time; every single push/sync re-writes the entire growing blob, and the (unvirtualized) inbox screen renders the full list.
- **Fix:** Cap the stored array to the most recent 300 (newest-first is already the invariant maintained by both writers) before every persist.
- **Tests:** `mobile/src/platform/notificationStore.test.ts` — pushes 320 notifications and asserts the persisted store never exceeds 300, keeping the newest.

### 5. No Prisma slow-query logging
- **Severity:** High
- **Evidence:** `web/src/lib/prisma-pg-factory.ts` constructed `PrismaClient` with no `log` config at all — there was no way to see which query was slow from logs before it caused a timeout.
- **Why it matters / impact:** Given several findings above involve unbounded/missing-index queries, a slow-query log is the cheapest way to catch a regression (or a query that only gets slow at production data volumes) before it escalates.
- **Fix:** Added `log: [{ level: "query", emit: "event" }]` and a `$on("query", ...)` listener that `console.warn`s any query over 500ms (configurable via `PRISMA_SLOW_QUERY_MS`), truncated to 300 chars.
- **Tests:** `web/src/lib/prisma-pg-factory.test.ts` — asserts the log config is applied and that the warn fires above threshold but not below it.

### 6. No completion/failure alerting for the payout-tier and layaway crons
- **Severity:** High
- **Evidence:** `web/src/app/api/cron/payout-tier/route.ts` and `.../cron/layaway/route.ts` returned HTTP 200 regardless of whether they actually did meaningful work — per-item failures were caught and swallowed into `console.error` with no aggregate signal, so a systemic failure (e.g. a schema drift breaking every seller's recalculation) would silently "succeed" every day.
- **Why it matters / impact:** Sentry only fires on thrown exceptions, not "processed 0 of 400 candidates." This is exactly the failure mode where sellers' instant-payout eligibility silently stops updating, or overdue layaways silently stop defaulting, until someone complains.
- **Fix:** Both cron entry points (`recalculateAllSellerPayoutTiers`, `processLayawayMaintenance`) now return structured counts (`candidates`/`processed`/`failed`, `overdueCandidates`/`defaulted`/`defaultFailures`). Added `web/src/lib/cron-anomaly-alert.ts` (`reportCronAnomaly`) which calls `Sentry.captureMessage` (falling back to `console.warn` when `SENTRY_DSN` isn't set) when a cron did suspiciously little or had partial failures.
- **Tests:** `web/src/lib/cron-anomaly-alert.test.ts`, `web/src/app/api/cron/payout-tier/route.test.ts`, `web/src/app/api/cron/layaway/route.test.ts` — cover the alert-vs-no-alert conditions for both crons.

### 7. `recalculateAllSellerPayoutTiers` processed every seller fully sequentially
- **Severity:** Critical
- **Evidence:** `web/src/services/payout/recalculate-seller-payout-tier.ts` looped `for (const {sellerId} of sellers) { await recalculateSellerPayoutTier(sellerId); }` — each seller doing ~7-9 sequential DB round trips, one seller at a time, with no pagination of the seller list itself.
- **Why it matters / impact:** As the seller base grows past a few hundred, this cron's wall-clock time grows linearly with no ceiling and risks exceeding the platform's function execution limit; a mid-run timeout means sellers later in the (arbitrarily ordered) list never get recalculated.
- **Fix:** Sellers are now processed in concurrent batches of 5 (`Promise.allSettled` per batch) instead of one at a time — same per-seller work, ~5x less wall-clock time, with per-seller failures still isolated and counted.
- **Not fixed (documented):** `computeSellerPayoutMetrics`'s own `order.findMany` (per seller) is genuinely unbounded — it intentionally needs the seller's **entire** lifetime order history to compute lifetime GMV and cancellation/chargeback/dispute rates. Bounding this without changing what "lifetime" means requires rewriting it to use `prisma.order.aggregate()`/`groupBy` (SQL-side sums) instead of `findMany` + JS `reduce`. This touches payout-eligibility math directly, so it was **not** changed blindly here — flagged as a recommended follow-up requiring careful equivalence testing.
- **Tests:** `web/src/services/payout/recalculate-seller-payout-tier.test.ts` — proves batches run concurrently (bounded ≤5 in-flight) rather than sequentially, and that failure/success counts remain accurate.

### 8. Stripe checkout-finalize webhook made two independent Stripe reads sequentially, and had zero timing visibility
- **Severity:** High
- **Evidence:** `web/src/services/payments.ts` (`finalizeStripeMarketplaceOrderPaid`) did `await fetchCheckoutSessionTax(sessionId)` then `await fetchCheckoutSessionChargeBreakdown(sessionId)` — both independent reads keyed only on `sessionId`. `web/src/app/api/stripe/webhook/route.ts` had no duration logging at all (confirmed zero `console.time`/`performance.now` hits repo-wide for this path).
- **Why it matters / impact:** Unnecessary added latency on every marketplace order's payment-confirmation webhook; combined with no timing log, there was no way to know from production logs whether webhook processing was fast or dangerously close to Stripe's retry/timeout window.
- **Fix:** The two Stripe reads now run via `Promise.all`. The webhook route now logs `[stripe webhook] processed <type> <ms>` on success and `[stripe webhook] failed <type> <ms>` on failure.
- **Tests:** `web/src/services/payments-finalize-tax-parallel.test.ts` — proves both Stripe calls are in-flight concurrently (not sequential) using controllable deferred promises. `web/src/app/api/stripe/webhook/route.test.ts` (existing) still passes with the new logging in place.

### 9. `GET /api/live-rooms/[id]` fetched the viewer's `User` row twice and ran independent lookups sequentially
- **Severity:** High
- **Evidence:** The route fetched `seller` (for email), then — if a viewer was present — fetched the **same viewer row twice**: once for `{ role: true }` (admin check) and again for `{ email: true }` (host-by-email check), all as sequential `await`s. Further down, buyer payment-readiness, payment-session-state, and unresolved-payment-failure lookups (three independent reads keyed on `(buyerId, liveRoomId)`) also ran sequentially.
- **Why it matters / impact:** This is the primary "load the live room" request, hit on every room join and every realtime fallback refetch — each avoidable round trip adds directly to perceived join latency for buyers.
- **Fix:** Seller and viewer rows are now fetched in one `Promise.all`, with the viewer query selecting both `role` and `email` in a single call. The three buyer payment-readiness reads now run via `Promise.all` instead of three sequential `await`s.
- **Tests:** `web/src/app/api/live-rooms/[id]/route-get-user-fetch.test.ts` — asserts the viewer is fetched exactly once (not twice) with both fields selected, across a full mocked GET request.

### 10. "Go Live" blocked the host's response on a bulk follower-notification insert
- **Severity:** High
- **Evidence:** `web/src/app/api/live-rooms/[id]/route.ts` did `await notifyFollowersSellerWentLive(...)` synchronously before returning success; `web/src/lib/seller-follow-notify.ts`'s follower lookup also had no `take` cap.
- **Why it matters / impact:** A seller with a large follower list would notice a real delay pressing "Go Live," proportional to follower count — the opposite of what a live-show host needs (an instant, confidence-inspiring start).
- **Fix:** Made the notify call fire-and-forget (`void ... .catch(...)`) so the host's response no longer waits on it; added a defensive `take: 20000` cap on the follower lookup.
- **Tests:** `web/src/lib/seller-follow-notify.test.ts` — covers the row cap and notification fan-out behavior.

---

## Documented, not fixed (flagged for follow-up — larger/riskier changes)

These require either a cross-cutting architecture change (client + server, or multiple screens)
or touch payment/auction-settlement-critical logic closely enough that a blind rewrite carries
real correctness risk. Each is called out individually in the six full subagent audit reports
(linked in the summary below) with exact file/line evidence and a recommended fix.

- **No real pagination for marketplace browse/search** (Critical) — homepage and marketplace browse both fetch the (now capped-at-500) full catalog client-side and filter/sort in the browser. Needs cursor-based pagination end-to-end (API contract change + web + mobile UI). *Mitigated* this pass with a defensive server-side cap; not solved.
- **Buy-now checkout re-fetches the same `Listing`/`Order` up to 6× and calls Shippo twice** (Critical) — `web/src/services/payments.ts` / `web/src/services/marketplace-checkout-shipping.ts`. Fixing requires threading an already-loaded row through the gate/preflight/transaction and caching the buyer's chosen Shippo rate — a meaningful refactor of the core checkout path. Flagged, not attempted, given payment-correctness risk.
- **`syncTaxReportingFromPaidOrders` unbounded rebuild loop** (Critical, admin-triggered only — confirmed not cron-invoked) — `web/src/lib/sales-tax-reporting.ts`. The volume-rebuild loop wipes and rebuilds `taxDestinationVolumeDaily` one order at a time with no bound; needs a single SQL `GROUP BY` rebuild instead. Financial-reporting logic — flagged for a dedicated pass.
- **Bid placement holds a row lock across ~150-190 sequential DB round trips** (Critical) — live auction proxy-bid resolution. Batching this safely requires care around auction-settlement correctness under concurrent bids; flagged rather than rewritten blindly.
- **50ms countdown tick causes a full live-room re-render** (Critical, UI) — chat/queue trees aren't memoized against the frequent timer tick. Fixing requires restructuring live-room client component boundaries; **not implemented** in this pass since it can't be visually verified in this environment and live-auction UI regressions are high-blast-radius. Recommended: isolate the countdown into its own leaf component and wrap chat/queue lists in `React.memo`.
- **Admin finance/tax dashboards aggregate thousands of rows in JS instead of SQL** (High) — `web/src/lib/admin/admin-finance-aggregates.ts`, `web/src/lib/sales-tax-reporting.ts`. Also has a documented correctness bug (5,000-row cap silently understates GMV past that point) layered on the performance issue. Needs `groupBy`/`aggregate` rewrite — financial-math-adjacent, flagged for a dedicated pass rather than fixed here.
- **`next/image` not used for listing/profile photos** (High, ~28+ files across web) — raw `<img>` tags throughout; a full migration is out of scope for a single pass. Recommended: prioritize the marketplace grid card and product gallery first (highest traffic).
- **Live feed (`VerticalLiveFeed`) mounts every stream's full component tree at once** (Critical, mobile) — needs virtualization/windowing of the live feed pager; a real UI/rendering change, not attempted blind.
- **4.8s mandatory cinematic intro on every cold start, even for logged-in users** (Critical, mobile) — product/onboarding decision as much as a performance one; flagged for product sign-off rather than unilaterally skipped.
- **Shippo webhook has no explicit idempotency key** (Medium) — relies on state-transition guards only; a genuine double-delivery in a tight window could send duplicate buyer/seller notifications. Needs a synthesized dedupe key; flagged given shipping-critical-path risk.
- **`sendMassNotification` fires unbounded, unthrottled realtime broadcasts per user** (Medium, admin-only) — fine at current beta scale, will need chunked concurrency before a large user base.

See the full six audit reports for complete file/line evidence on every item above and everything
not listed here (all Medium/Low findings not called out individually in this summary).

---

## Summary

### Critical launch blockers
None of the fixes in this pass are launch-blocking on their own (the app functions correctly
either way), but two **documented-not-fixed** items are worth explicit launch-readiness
awareness before a large marketing push:
- Marketplace browse has no real pagination (mitigated with a 500-row cap this pass) — fine at
  current catalog size, will need real pagination before the catalog meaningfully grows.
- Buy-now checkout's redundant fetches + double Shippo call add real latency per order; not
  currently causing failures, but the highest-latency path in the app under concurrent load
  (e.g. a live show ending and many buyers checking out at once).

### High-risk performance issues (fixed)
Missing DB indexes, unbounded public/account list queries, no mobile fetch timeout, unbounded
mobile notification storage, no slow-query visibility, no cron failure alerting, sequential
seller-tier recalculation, sequential Stripe webhook reads with no timing log, duplicate/serial
live-room lookups, and a blocking Go-Live notification fan-out — see items 1-10 above.

### High-risk performance issues (documented only)
Checkout duplicate fetches, tax-reporting rebuild loop, bid-chain sequential round trips, live
countdown re-render, admin JS-side financial aggregation, `next/image` migration, mobile live
feed virtualization, mandatory cold-start intro — see "Documented, not fixed" above and the six
full subagent reports for complete detail.

### Medium/low issues
21 Medium and 14 Low findings across all six areas are documented in the full subagent audit
reports but not itemized individually here; none are launch-blocking. Two Medium items were
partially mitigated as side effects of fixes above (defensive `take` caps on several account
list endpoints).

### Files changed
- `web/prisma/schema.prisma`, `web/prisma/migrations/20260703160000_perf_indexes/migration.sql`
- `web/src/app/api/listings/route.ts`
- `web/src/app/api/account/watchlist/route.ts`, `.../offers/route.ts`, `.../follows/route.ts`, `.../threads/route.ts`
- `web/src/app/api/listings/[id]/offers/route.ts`
- `web/src/lib/prisma-pg-factory.ts`
- `web/src/lib/cron-anomaly-alert.ts` (new)
- `web/src/app/api/cron/payout-tier/route.ts`, `web/src/app/api/cron/layaway/route.ts`
- `web/src/services/payout/recalculate-seller-payout-tier.ts`
- `web/src/services/layaway.ts`
- `web/src/services/payments.ts`
- `web/src/app/api/stripe/webhook/route.ts`
- `web/src/app/api/live-rooms/[id]/route.ts`
- `web/src/lib/seller-follow-notify.ts`
- `mobile/src/lib/fetchWebApiMobile.ts`
- `mobile/src/platform/notificationStore.ts`

### Tests added
`web/src/app/api/listings/route.published-merch-cap.test.ts`,
`web/src/app/api/account/account-list-endpoints-cap.test.ts`,
`web/src/lib/prisma-pg-factory.test.ts`,
`web/src/lib/cron-anomaly-alert.test.ts`,
`web/src/app/api/cron/payout-tier/route.test.ts` (extended),
`web/src/app/api/cron/layaway/route.test.ts` (extended),
`web/src/services/payout/recalculate-seller-payout-tier.test.ts`,
`web/src/services/payments-finalize-tax-parallel.test.ts`,
`web/src/app/api/live-rooms/[id]/route-get-user-fetch.test.ts`,
`web/src/lib/seller-follow-notify.test.ts`,
`mobile/src/lib/fetchWebApiMobile.test.ts`,
`mobile/src/platform/notificationStore.test.ts`.

Full suite: **web 178 files / 857 tests passing**, **mobile 72 files / 327 tests passing**,
`tsc --noEmit` clean on both.

### Remaining risks
- Marketplace browse/search still has no real pagination — a 500-row safety cap only bounds the
  worst case, it doesn't fix the underlying client-side-filter architecture.
- Checkout's redundant fetches and double Shippo call remain the highest-latency path under
  concurrent load; not currently causing errors, but the first thing to revisit if checkout
  latency/timeout reports appear post-launch.
- Bid-chain resolution's ~150-190 sequential round trips under a held row lock remain a
  peak-concurrency risk for very active live auctions (many simultaneous bidders on one lot).
- `computeSellerPayoutMetrics`'s unbounded per-seller order fetch remains a scaling risk as
  individual sellers' lifetime order counts grow, independent of the cron-level concurrency fix.
- No APM/latency dashboard exists beyond Sentry's 5% production trace sampling (already enabled,
  confirmed correctly configured) and the new slow-query `console.warn`; both surface in logs,
  not a dashboard — acceptable for current beta scale but worth revisiting before wide launch.

### Final recommendation
**Launch with monitoring.** No fix in this pass was launch-blocking in isolation, and the
highest-risk performance findings (checkout duplication, tax-rebuild loop, bid-chain batching,
live-room re-render) are architecture-level and correctly flagged rather than blindly patched.
Watch the new slow-query logs and cron-anomaly alerts closely in the first weeks post-launch,
and prioritize the "Documented, not fixed" list — especially checkout de-duplication and real
marketplace pagination — before any major growth push (paid marketing, large seller onboarding
wave, etc.).
