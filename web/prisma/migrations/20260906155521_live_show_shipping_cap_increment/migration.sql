-- No-op: the per-item shipping cap split ended up being implemented as a hard-coded engine
-- behavior (see shared/live-show-shipping-config.ts's standardLiveShowShippingCapIncrementCents),
-- not a stored per-show setting, so no schema change is needed after all. This migration file is
-- kept (rather than deleted) only because the sandbox environment could not remove it, but it
-- intentionally does nothing.
SELECT 1;
