-- Admin-editable live show volume fee tiers (single row).
CREATE TABLE "PlatformLiveShowFeeConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "tier1FeePercent" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "tier2ThresholdUsd" DOUBLE PRECISION NOT NULL DEFAULT 1000,
    "tier2FeePercent" DOUBLE PRECISION NOT NULL DEFAULT 7.25,
    "tier3ThresholdUsd" DOUBLE PRECISION NOT NULL DEFAULT 3000,
    "tier3FeePercent" DOUBLE PRECISION NOT NULL DEFAULT 6.5,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,

    CONSTRAINT "PlatformLiveShowFeeConfig_pkey" PRIMARY KEY ("id")
);

INSERT INTO "PlatformLiveShowFeeConfig" (
    "id",
    "tier1FeePercent",
    "tier2ThresholdUsd",
    "tier2FeePercent",
    "tier3ThresholdUsd",
    "tier3FeePercent",
    "updatedAt"
)
VALUES ('default', 8, 1000, 7.25, 3000, 6.5, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
