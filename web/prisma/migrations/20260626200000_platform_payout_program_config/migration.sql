-- Admin-editable seller payout program + Stripe-aligned instant payout daily count tracking.
CREATE TABLE "PlatformPayoutProgramConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "fastMinAccountAgeDays" INTEGER NOT NULL DEFAULT 30,
    "fastMinLifetimeGmvUsd" DOUBLE PRECISION NOT NULL DEFAULT 10000,
    "fastMinCompletedOrders" INTEGER NOT NULL DEFAULT 100,
    "instantMinAccountAgeDays" INTEGER NOT NULL DEFAULT 60,
    "instantMinLifetimeGmvUsd" DOUBLE PRECISION NOT NULL DEFAULT 5000,
    "instantMaxCancellationRate" DOUBLE PRECISION NOT NULL DEFAULT 0.01,
    "instantMaxChargebackRate" DOUBLE PRECISION NOT NULL DEFAULT 0.0075,
    "instantMaxDisputeRate" DOUBLE PRECISION NOT NULL DEFAULT 0.0075,
    "instantMaxUnresolvedDisputes" INTEGER NOT NULL DEFAULT 0,
    "instantPerOrderUsd" DOUBLE PRECISION NOT NULL DEFAULT 9999,
    "instantDailyUsd" DOUBLE PRECISION NOT NULL DEFAULT 99990,
    "instantMaxDailyCount" INTEGER NOT NULL DEFAULT 10,
    "instantMaxOutstandingUsd" DOUBLE PRECISION NOT NULL DEFAULT 25000,
    "instantSuspensionRateCeiling" DOUBLE PRECISION NOT NULL DEFAULT 0.0075,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,

    CONSTRAINT "PlatformPayoutProgramConfig_pkey" PRIMARY KEY ("id")
);

INSERT INTO "PlatformPayoutProgramConfig" (
    "id",
    "fastMinAccountAgeDays",
    "fastMinLifetimeGmvUsd",
    "fastMinCompletedOrders",
    "instantMinAccountAgeDays",
    "instantMinLifetimeGmvUsd",
    "instantMaxCancellationRate",
    "instantMaxChargebackRate",
    "instantMaxDisputeRate",
    "instantMaxUnresolvedDisputes",
    "instantPerOrderUsd",
    "instantDailyUsd",
    "instantMaxDailyCount",
    "instantMaxOutstandingUsd",
    "instantSuspensionRateCeiling",
    "updatedAt"
)
VALUES (
    'default',
    30,
    10000,
    100,
    60,
    5000,
    0.01,
    0.0075,
    0.0075,
    0,
    9999,
    99990,
    10,
    25000,
    0.0075,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "SellerPayoutMetrics" ADD COLUMN IF NOT EXISTS "dailyInstantPayoutCount" INTEGER NOT NULL DEFAULT 0;
