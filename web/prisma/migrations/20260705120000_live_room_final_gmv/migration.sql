-- Bug fix (2026-07): `completedSalesGmvUsd` is intentionally zeroed when a live show ends,
-- which previously made every downstream fee-tier reconstruction for that show's *past* orders
-- (seller sales report, admin finance/reconciliation) recompute against 0 GMV instead of the
-- real cumulative total, drifting to the wrong (highest) fee tier after the show ended even
-- though the actual Stripe charge already applied the correct fee at sale time.
--
-- `finalSalesGmvUsd` snapshots the true final total once, when the show ends, and is never
-- reset — callers reconstructing a historical order's fee tier should read this field once
-- the show is no longer `live`.
ALTER TABLE "LiveRoom" ADD COLUMN "finalSalesGmvUsd" DOUBLE PRECISION;
