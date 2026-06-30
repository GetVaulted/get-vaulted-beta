-- Admin-editable marketplace platform fee (single row).
CREATE TABLE "PlatformMarketplaceFeeConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "platformFeePercent" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,

    CONSTRAINT "PlatformMarketplaceFeeConfig_pkey" PRIMARY KEY ("id")
);

INSERT INTO "PlatformMarketplaceFeeConfig" ("id", "platformFeePercent", "updatedAt")
VALUES ('default', 8, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
