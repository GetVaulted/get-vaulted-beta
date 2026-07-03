-- Atomic idempotency claim table for Stripe webhook events (financial correctness).
-- See web/src/app/api/stripe/webhook/route.ts for usage.

CREATE TABLE "ProcessedStripeEvent" (
    "id" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedStripeEvent_pkey" PRIMARY KEY ("id")
);

-- Mutex flag around escrow-provider fund release (prevents concurrent double-release).
ALTER TABLE "Order" ADD COLUMN "escrowReleaseInFlight" BOOLEAN NOT NULL DEFAULT false;
