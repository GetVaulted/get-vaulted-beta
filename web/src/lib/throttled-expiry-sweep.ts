import { processAuctionPaymentExpiries } from "@/services/payments";
import { createTtlCache } from "@/lib/ttl-cache";

/**
 * `processAuctionPaymentExpiries` is a global sweep (every overdue auction payment on the platform),
 * not something scoped to the request that triggers it. Read endpoints that every viewer polls
 * (live room GET, marketplace listings GET) used to run it on every call. The sweep is idempotent and
 * also runs on money-moving paths and on a schedule, so on read paths it only needs to run about once
 * per interval per server instance, and concurrent callers share one run.
 */
const READ_PATH_SWEEP_INTERVAL_MS = 10_000;
const sweepCache = createTtlCache<true>(2);

export async function processAuctionPaymentExpiriesThrottled(
  minIntervalMs: number = READ_PATH_SWEEP_INTERVAL_MS,
): Promise<void> {
  await sweepCache.get("sweep", minIntervalMs, async () => {
    await processAuctionPaymentExpiries();
    return true as const;
  });
}
