-- Platform giveaway campaigns + Get Vaulted Credit ledger

CREATE TYPE "GiveawayCampaignStatus" AS ENUM ('draft', 'scheduled', 'active', 'paused', 'ended', 'cancelled');
CREATE TYPE "GiveawayPrizeType" AS ENUM ('platform_credit', 'cash', 'product', 'custom');
CREATE TYPE "GiveawayEntryType" AS ENUM ('existing_user', 'new_signup', 'referral', 'manual_adjustment');
CREATE TYPE "GiveawayDrawStatus" AS ENUM ('pending_confirm', 'confirmed', 'superseded');
CREATE TYPE "PlatformCreditStatus" AS ENUM ('available', 'reserved', 'spent', 'voided');
CREATE TYPE "PlatformCreditSourceType" AS ENUM ('giveaway_prize', 'admin_grant');

CREATE TABLE "GiveawayCampaign" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "rulesText" TEXT NOT NULL DEFAULT '',
    "prizeType" "GiveawayPrizeType" NOT NULL DEFAULT 'platform_credit',
    "prizeAmountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "prizeLabel" TEXT NOT NULL DEFAULT '',
    "prizeMetadata" JSONB,
    "status" "GiveawayCampaignStatus" NOT NULL DEFAULT 'draft',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "winnerUserId" TEXT,
    "winnerConfirmedAt" TIMESTAMP(3),
    "prizeAwardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiveawayCampaign_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GiveawayCampaign_slug_key" ON "GiveawayCampaign"("slug");
CREATE INDEX "GiveawayCampaign_status_startsAt_endsAt_idx" ON "GiveawayCampaign"("status", "startsAt", "endsAt");

CREATE TABLE "GiveawayEntryLedger" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entryType" "GiveawayEntryType" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "source" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiveawayEntryLedger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GiveawayEntryLedger_idempotencyKey_key" ON "GiveawayEntryLedger"("idempotencyKey");
CREATE INDEX "GiveawayEntryLedger_campaignId_userId_idx" ON "GiveawayEntryLedger"("campaignId", "userId");
CREATE INDEX "GiveawayEntryLedger_campaignId_createdAt_idx" ON "GiveawayEntryLedger"("campaignId", "createdAt");
CREATE INDEX "GiveawayEntryLedger_userId_createdAt_idx" ON "GiveawayEntryLedger"("userId", "createdAt");

CREATE TABLE "GiveawayFraudFlag" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiveawayFraudFlag_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GiveawayFraudFlag_campaignId_userId_idx" ON "GiveawayFraudFlag"("campaignId", "userId");
CREATE INDEX "GiveawayFraudFlag_userId_createdAt_idx" ON "GiveawayFraudFlag"("userId", "createdAt");
CREATE UNIQUE INDEX "GiveawayFraudFlag_campaignId_userId_reason_key" ON "GiveawayFraudFlag"("campaignId", "userId", "reason");

CREATE TABLE "GiveawayDraw" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "winnerUserId" TEXT NOT NULL,
    "totalEntries" INTEGER NOT NULL,
    "totalEntrants" INTEGER NOT NULL,
    "drawSeed" TEXT NOT NULL,
    "drawHash" TEXT NOT NULL,
    "isRedraw" BOOLEAN NOT NULL DEFAULT false,
    "redrawReason" TEXT,
    "adminUserId" TEXT NOT NULL,
    "status" "GiveawayDrawStatus" NOT NULL DEFAULT 'pending_confirm',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiveawayDraw_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GiveawayDraw_campaignId_createdAt_idx" ON "GiveawayDraw"("campaignId", "createdAt");

CREATE TABLE "PlatformCredit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "status" "PlatformCreditStatus" NOT NULL DEFAULT 'available',
    "sourceType" "PlatformCreditSourceType" NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "reservedForRef" TEXT,
    "reservedAt" TIMESTAMP(3),
    "spentOrderId" TEXT,
    "spentAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformCredit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformCredit_sourceType_sourceRef_key" ON "PlatformCredit"("sourceType", "sourceRef");
CREATE INDEX "PlatformCredit_userId_status_idx" ON "PlatformCredit"("userId", "status");

ALTER TABLE "Order" ADD COLUMN "platformCreditAppliedUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "GiveawayCampaign" ADD CONSTRAINT "GiveawayCampaign_winnerUserId_fkey" FOREIGN KEY ("winnerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GiveawayEntryLedger" ADD CONSTRAINT "GiveawayEntryLedger_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "GiveawayCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GiveawayEntryLedger" ADD CONSTRAINT "GiveawayEntryLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GiveawayFraudFlag" ADD CONSTRAINT "GiveawayFraudFlag_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "GiveawayCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GiveawayFraudFlag" ADD CONSTRAINT "GiveawayFraudFlag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GiveawayDraw" ADD CONSTRAINT "GiveawayDraw_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "GiveawayCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GiveawayDraw" ADD CONSTRAINT "GiveawayDraw_winnerUserId_fkey" FOREIGN KEY ("winnerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GiveawayDraw" ADD CONSTRAINT "GiveawayDraw_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlatformCredit" ADD CONSTRAINT "PlatformCredit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlatformCredit" ADD CONSTRAINT "PlatformCredit_spentOrderId_fkey" FOREIGN KEY ("spentOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
