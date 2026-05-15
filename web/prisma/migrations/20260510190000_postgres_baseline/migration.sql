-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "BuyingFormat" AS ENUM ('buy_now', 'auction');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('draft', 'active', 'sold', 'auction_live', 'awaiting_auction_payment', 'auction_ended_unpaid');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('user', 'admin');

-- CreateEnum
CREATE TYPE "LiveRoomType" AS ENUM ('auction', 'sale', 'break');

-- CreateEnum
CREATE TYPE "LiveRoomStatus" AS ENUM ('scheduled', 'live', 'ended');

-- CreateEnum
CREATE TYPE "LiveStreamProvider" AS ENUM ('none', 'aws_ivs');

-- CreateEnum
CREATE TYPE "LiveStreamHealth" AS ENUM ('not_provisioned', 'offline', 'connecting', 'live', 'ended', 'error');

-- CreateEnum
CREATE TYPE "LiveRoomItemStatus" AS ENUM ('queued', 'active', 'sold', 'skipped');

-- CreateEnum
CREATE TYPE "LiveRoomMessageType" AS ENUM ('chat', 'bid', 'purchase', 'system');

-- CreateEnum
CREATE TYPE "BreakFormat" AS ENUM ('pick_your_team', 'random_teams', 'random_divisions');

-- CreateEnum
CREATE TYPE "BreakSpotClaimStatus" AS ENUM ('confirmed', 'paid', 'locked', 'released');

-- CreateEnum
CREATE TYPE "TeamBoardLeague" AS ENUM ('nfl', 'nba', 'mlb');

-- CreateEnum
CREATE TYPE "OrderPaymentMethod" AS ENUM ('stripe', 'escrow');

-- CreateEnum
CREATE TYPE "EscrowStatus" AS ENUM ('pending', 'buyer_paid', 'seller_shipped', 'delivered', 'inspection_period', 'approved', 'funds_released', 'disputed', 'cancelled');

-- CreateEnum
CREATE TYPE "ShippingCategory" AS ENUM ('raw_card', 'slab', 'small_collectible', 'custom');

-- CreateEnum
CREATE TYPE "AddressType" AS ENUM ('shipping', 'return', 'billing', 'ship_from');

-- CreateEnum
CREATE TYPE "TradeOfferStatus" AS ENUM ('pending', 'countered', 'accepted', 'completed', 'declined', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "TradeItemSide" AS ENUM ('proposer', 'recipient');

-- CreateEnum
CREATE TYPE "TradeOfferEventType" AS ENUM ('offer_created', 'offer_countered', 'offer_accepted', 'offer_declined', 'offer_cancelled', 'offer_expired');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT,
    "name" TEXT,
    "image" TEXT,
    "emailVerified" TIMESTAMP(3),
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "suspendedAt" TIMESTAMP(3),
    "stripeAccountId" TEXT,
    "stripeOnboardingComplete" BOOLEAN NOT NULL DEFAULT false,
    "stripeCustomerId" TEXT,
    "shipFromName" TEXT,
    "shipFromStreet" TEXT,
    "shipFromCity" TEXT,
    "shipFromState" TEXT,
    "shipFromZip" TEXT,
    "shipFromCountry" TEXT,
    "defaultShipFromAddressId" TEXT,
    "trustapUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerificationCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AddressType" NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "company" TEXT,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'US',
    "phone" TEXT,
    "email" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerCommerceEvent" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "listingId" TEXT,
    "orderId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellerCommerceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerFollow" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellerFollow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "buyingFormat" "BuyingFormat" NOT NULL,
    "priceUsd" DOUBLE PRECISION NOT NULL,
    "startingBidUsd" DOUBLE PRECISION,
    "currentBidUsd" DOUBLE PRECISION,
    "allowOffers" BOOLEAN NOT NULL DEFAULT false,
    "acceptTradeOffers" BOOLEAN NOT NULL DEFAULT false,
    "minimumOfferUsd" DOUBLE PRECISION,
    "status" "ListingStatus" NOT NULL DEFAULT 'draft',
    "shippingPriceUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "handlingTime" TEXT NOT NULL DEFAULT '',
    "signatureRequired" BOOLEAN NOT NULL DEFAULT false,
    "reservePriceUsd" DOUBLE PRECISION,
    "auctionDurationDays" INTEGER,
    "auctionEndsAt" TIMESTAMP(3),
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "watchersCount" INTEGER NOT NULL DEFAULT 0,
    "vaultPick" BOOLEAN NOT NULL DEFAULT false,
    "isCompanyListing" BOOLEAN NOT NULL DEFAULT false,
    "moderationRemovedAt" TIMESTAMP(3),
    "adminReviewedAt" TIMESTAMP(3),
    "workspaceKey" TEXT,
    "parcelWeightOz" DOUBLE PRECISION,
    "parcelLengthIn" DOUBLE PRECISION,
    "parcelWidthIn" DOUBLE PRECISION,
    "parcelHeightIn" DOUBLE PRECISION,
    "shippingCategory" "ShippingCategory" NOT NULL DEFAULT 'raw_card',
    "shippingBaseWeightOz" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "shippingIncrementalWeightOz" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "shippingPriceCapCents" INTEGER,
    "shipAlone" BOOLEAN NOT NULL DEFAULT false,
    "shipFromAddressId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeOffer" (
    "id" TEXT NOT NULL,
    "targetListingId" TEXT NOT NULL,
    "proposerId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "status" "TradeOfferStatus" NOT NULL DEFAULT 'pending',
    "proposerCashUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recipientCashUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "messageToRecipient" TEXT,
    "conversationId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeOfferItem" (
    "id" TEXT NOT NULL,
    "tradeOfferId" TEXT NOT NULL,
    "side" "TradeItemSide" NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "listingTitleSnapshot" TEXT NOT NULL,
    "listingImageUrlSnapshot" TEXT,
    "listingCategorySnapshot" TEXT NOT NULL,
    "listingConditionSnapshot" TEXT NOT NULL,
    "listingPriceUsdSnapshot" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeOfferItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeOfferEvent" (
    "id" TEXT NOT NULL,
    "tradeOfferId" TEXT NOT NULL,
    "type" "TradeOfferEventType" NOT NULL,
    "actorUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeOfferEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveRoom" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'Other',
    "roomType" "LiveRoomType" NOT NULL,
    "status" "LiveRoomStatus" NOT NULL DEFAULT 'scheduled',
    "thumbnailUrl" TEXT NOT NULL DEFAULT '',
    "viewerCount" INTEGER NOT NULL DEFAULT 0,
    "streamProvider" "LiveStreamProvider" NOT NULL DEFAULT 'none',
    "streamHealth" "LiveStreamHealth" NOT NULL DEFAULT 'not_provisioned',
    "ivsChannelArn" TEXT,
    "ivsChannelName" TEXT,
    "ivsPlaybackUrl" TEXT,
    "ivsIngestEndpoint" TEXT,
    "ivsStreamKeyArn" TEXT,
    "ivsStreamKeyCreatedAt" TIMESTAMP(3),
    "streamStartedAt" TIMESTAMP(3),
    "streamEndedAt" TIMESTAMP(3),
    "lastIvsStatusSyncAt" TIMESTAMP(3),
    "lastIvsError" TEXT,
    "scheduledStartAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "roomVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "breakFormat" "BreakFormat" NOT NULL DEFAULT 'pick_your_team',
    "breakDisplayTitle" TEXT NOT NULL DEFAULT '',
    "breakSpotPriceUsd" DOUBLE PRECISION,
    "breakTotalSpots" INTEGER,
    "breakTeamLabelsJson" TEXT NOT NULL DEFAULT '[]',
    "breakFilledLockedAt" TIMESTAMP(3),
    "assignmentsLockedAt" TIMESTAMP(3),
    "randomizedAt" TIMESTAMP(3),
    "randomizationSeed" TEXT,
    "randomizationPreviewJson" TEXT,
    "randomizationResultJson" TEXT,
    "lockPurchases" BOOLEAN NOT NULL DEFAULT false,
    "breakPaused" BOOLEAN NOT NULL DEFAULT false,
    "teamBoardLeague" "TeamBoardLeague" NOT NULL DEFAULT 'nba',

    CONSTRAINT "LiveRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveRoomTeamBoard" (
    "liveRoomId" TEXT NOT NULL,
    "league" "TeamBoardLeague" NOT NULL DEFAULT 'nba',
    "visible" BOOLEAN NOT NULL DEFAULT false,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "currentPickerUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveRoomTeamBoard_pkey" PRIMARY KEY ("liveRoomId")
);

-- CreateTable
CREATE TABLE "LiveRoomTeamBoardPick" (
    "id" TEXT NOT NULL,
    "liveRoomId" TEXT NOT NULL,
    "league" "TeamBoardLeague" NOT NULL,
    "teamAbbr" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveRoomTeamBoardPick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveRoomItem" (
    "id" TEXT NOT NULL,
    "liveRoomId" TEXT NOT NULL,
    "listingId" TEXT,
    "lastHighBidderId" TEXT,
    "title" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "priceUsd" DOUBLE PRECISION,
    "startingBidUsd" DOUBLE PRECISION,
    "currentBidUsd" DOUBLE PRECISION,
    "status" "LiveRoomItemStatus" NOT NULL DEFAULT 'queued',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "teamBoardMisc" BOOLEAN NOT NULL DEFAULT false,
    "itemVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveRoomItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreakSpot" (
    "id" TEXT NOT NULL,
    "liveRoomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "spotLabel" TEXT NOT NULL,
    "priceUsd" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "claimStatus" "BreakSpotClaimStatus" NOT NULL DEFAULT 'confirmed',
    "liveRoomItemId" TEXT,
    "paidAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "breakPaymentStatus" TEXT NOT NULL DEFAULT 'unpaid',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BreakSpot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreakHit" (
    "id" TEXT NOT NULL,
    "liveRoomId" TEXT NOT NULL,
    "liveRoomItemId" TEXT,
    "spotLabel" TEXT NOT NULL DEFAULT '',
    "buyerId" TEXT,
    "title" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BreakHit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HitClip" (
    "id" TEXT NOT NULL,
    "liveRoomId" TEXT NOT NULL,
    "breakHitId" TEXT,
    "sellerId" TEXT NOT NULL,
    "buyerId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "thumbnailUrl" TEXT NOT NULL DEFAULT '',
    "clipUrl" TEXT,
    "itemTitle" TEXT,
    "teamOrSpotLabel" TEXT,
    "shareCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HitClip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveRoomMessage" (
    "id" TEXT NOT NULL,
    "liveRoomId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "messageType" "LiveRoomMessageType" NOT NULL DEFAULT 'chat',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveRoomMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingImage" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ListingImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "counterAmountUsd" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bid" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "bidderId" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "maxBidUsd" DOUBLE PRECISION,
    "shipRecipientName" TEXT,
    "shipAddress" TEXT,
    "shipCity" TEXT,
    "shipState" TEXT,
    "shipZip" TEXT,
    "shipCountry" TEXT,
    "paymentLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "itemPriceUsd" DOUBLE PRECISION NOT NULL,
    "shippingPriceUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalUsd" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paymentStatus" TEXT NOT NULL DEFAULT 'paid',
    "fulfillmentStatus" TEXT NOT NULL DEFAULT 'pending',
    "shipRecipientName" TEXT NOT NULL,
    "shipAddress" TEXT NOT NULL,
    "shipCity" TEXT NOT NULL,
    "shipState" TEXT NOT NULL,
    "shipZip" TEXT NOT NULL,
    "shipCountry" TEXT NOT NULL,
    "paymentLabel" TEXT NOT NULL DEFAULT 'placeholder',
    "paymentMethod" "OrderPaymentMethod" NOT NULL DEFAULT 'stripe',
    "escrowProvider" TEXT,
    "escrowTransactionId" TEXT,
    "escrowStatus" "EscrowStatus",
    "escrowCheckoutUrl" TEXT,
    "escrowFeeCents" INTEGER NOT NULL DEFAULT 0,
    "fundsReleasedAt" TIMESTAMP(3),
    "trustapBuyerUserId" TEXT,
    "escrowReleasePaused" BOOLEAN NOT NULL DEFAULT false,
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "paymentDeadlineAt" TIMESTAMP(3),
    "liveShippingSessionId" TEXT,
    "buyerAddressId" TEXT,
    "sellerShipFromAddressId" TEXT,
    "shippoShipmentId" TEXT,
    "shippoTransactionId" TEXT,
    "carrier" TEXT,
    "service" TEXT,
    "trackingNumber" TEXT,
    "trackingUrl" TEXT,
    "labelUrl" TEXT,
    "shippingStatus" TEXT,
    "shippedAt" TIMESTAMP(3),
    "shippingChargedCents" INTEGER,
    "shippingLabelCostCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveShippingSession" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "liveShowId" TEXT NOT NULL,
    "destinationAddressId" TEXT,
    "pricingWeightOz" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "shippingCostCents" INTEGER NOT NULL DEFAULT 0,
    "capReached" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveShippingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveShippingSessionItem" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "baseWeightOz" DOUBLE PRECISION NOT NULL,
    "incrementalWeightOz" DOUBLE PRECISION NOT NULL,
    "appliedWeightOz" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveShippingSessionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEventLog" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "externalId" TEXT,
    "payload" TEXT NOT NULL DEFAULT '',
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEventLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchlistItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageThread" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "listingId" TEXT,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "EmailVerificationCode_userId_expiresAt_idx" ON "EmailVerificationCode"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "EmailVerificationCode_userId_consumedAt_idx" ON "EmailVerificationCode"("userId", "consumedAt");

-- CreateIndex
CREATE INDEX "Address_userId_type_isDefault_idx" ON "Address"("userId", "type", "isDefault");

-- CreateIndex
CREATE INDEX "SellerCommerceEvent_sellerId_createdAt_idx" ON "SellerCommerceEvent"("sellerId", "createdAt");

-- CreateIndex
CREATE INDEX "SellerCommerceEvent_listingId_idx" ON "SellerCommerceEvent"("listingId");

-- CreateIndex
CREATE INDEX "SellerFollow_sellerId_idx" ON "SellerFollow"("sellerId");

-- CreateIndex
CREATE UNIQUE INDEX "SellerFollow_followerId_sellerId_key" ON "SellerFollow"("followerId", "sellerId");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_sellerId_workspaceKey_key" ON "Listing"("sellerId", "workspaceKey");

-- CreateIndex
CREATE INDEX "TradeOffer_targetListingId_status_createdAt_idx" ON "TradeOffer"("targetListingId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "TradeOffer_proposerId_status_createdAt_idx" ON "TradeOffer"("proposerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "TradeOffer_recipientId_status_createdAt_idx" ON "TradeOffer"("recipientId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "TradeOffer_status_updatedAt_idx" ON "TradeOffer"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "TradeOffer_conversationId_idx" ON "TradeOffer"("conversationId");

-- CreateIndex
CREATE INDEX "TradeOffer_expiresAt_idx" ON "TradeOffer"("expiresAt");

-- CreateIndex
CREATE INDEX "TradeOfferItem_tradeOfferId_side_idx" ON "TradeOfferItem"("tradeOfferId", "side");

-- CreateIndex
CREATE INDEX "TradeOfferItem_ownerUserId_createdAt_idx" ON "TradeOfferItem"("ownerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "TradeOfferItem_listingId_idx" ON "TradeOfferItem"("listingId");

-- CreateIndex
CREATE UNIQUE INDEX "TradeOfferItem_tradeOfferId_side_listingId_key" ON "TradeOfferItem"("tradeOfferId", "side", "listingId");

-- CreateIndex
CREATE INDEX "TradeOfferEvent_tradeOfferId_createdAt_idx" ON "TradeOfferEvent"("tradeOfferId", "createdAt");

-- CreateIndex
CREATE INDEX "TradeOfferEvent_actorUserId_createdAt_idx" ON "TradeOfferEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "LiveRoom_sellerId_status_idx" ON "LiveRoom"("sellerId", "status");

-- CreateIndex
CREATE INDEX "LiveRoom_status_scheduledStartAt_idx" ON "LiveRoom"("status", "scheduledStartAt");

-- CreateIndex
CREATE INDEX "LiveRoomTeamBoardPick_liveRoomId_league_idx" ON "LiveRoomTeamBoardPick"("liveRoomId", "league");

-- CreateIndex
CREATE UNIQUE INDEX "LiveRoomTeamBoardPick_liveRoomId_league_teamAbbr_key" ON "LiveRoomTeamBoardPick"("liveRoomId", "league", "teamAbbr");

-- CreateIndex
CREATE INDEX "LiveRoomItem_liveRoomId_sortOrder_idx" ON "LiveRoomItem"("liveRoomId", "sortOrder");

-- CreateIndex
CREATE INDEX "BreakSpot_liveRoomId_idx" ON "BreakSpot"("liveRoomId");

-- CreateIndex
CREATE INDEX "BreakSpot_userId_idx" ON "BreakSpot"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BreakSpot_liveRoomId_spotLabel_key" ON "BreakSpot"("liveRoomId", "spotLabel");

-- CreateIndex
CREATE INDEX "BreakHit_liveRoomId_createdAt_idx" ON "BreakHit"("liveRoomId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "HitClip_breakHitId_key" ON "HitClip"("breakHitId");

-- CreateIndex
CREATE INDEX "HitClip_liveRoomId_createdAt_idx" ON "HitClip"("liveRoomId", "createdAt");

-- CreateIndex
CREATE INDEX "HitClip_sellerId_createdAt_idx" ON "HitClip"("sellerId", "createdAt");

-- CreateIndex
CREATE INDEX "LiveRoomMessage_liveRoomId_createdAt_idx" ON "LiveRoomMessage"("liveRoomId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_listingId_key" ON "Order"("listingId");

-- CreateIndex
CREATE INDEX "Order_escrowTransactionId_idx" ON "Order"("escrowTransactionId");

-- CreateIndex
CREATE INDEX "Order_liveShippingSessionId_idx" ON "Order"("liveShippingSessionId");

-- CreateIndex
CREATE INDEX "LiveShippingSession_buyerId_liveShowId_sellerId_idx" ON "LiveShippingSession"("buyerId", "liveShowId", "sellerId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveShippingSession_buyerId_sellerId_liveShowId_destination_key" ON "LiveShippingSession"("buyerId", "sellerId", "liveShowId", "destinationAddressId");

-- CreateIndex
CREATE INDEX "LiveShippingSessionItem_sessionId_createdAt_idx" ON "LiveShippingSessionItem"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LiveShippingSessionItem_orderId_key" ON "LiveShippingSessionItem"("orderId");

-- CreateIndex
CREATE INDEX "WebhookEventLog_source_createdAt_idx" ON "WebhookEventLog"("source", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookEventLog_source_externalId_idx" ON "WebhookEventLog"("source", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistItem_userId_listingId_key" ON "WatchlistItem"("userId", "listingId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageThread_buyerId_sellerId_listingId_key" ON "MessageThread"("buyerId", "sellerId", "listingId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_defaultShipFromAddressId_fkey" FOREIGN KEY ("defaultShipFromAddressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerificationCode" ADD CONSTRAINT "EmailVerificationCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerCommerceEvent" ADD CONSTRAINT "SellerCommerceEvent_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerFollow" ADD CONSTRAINT "SellerFollow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerFollow" ADD CONSTRAINT "SellerFollow_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_shipFromAddressId_fkey" FOREIGN KEY ("shipFromAddressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeOffer" ADD CONSTRAINT "TradeOffer_targetListingId_fkey" FOREIGN KEY ("targetListingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeOffer" ADD CONSTRAINT "TradeOffer_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeOffer" ADD CONSTRAINT "TradeOffer_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeOfferItem" ADD CONSTRAINT "TradeOfferItem_tradeOfferId_fkey" FOREIGN KEY ("tradeOfferId") REFERENCES "TradeOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeOfferItem" ADD CONSTRAINT "TradeOfferItem_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeOfferItem" ADD CONSTRAINT "TradeOfferItem_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeOfferEvent" ADD CONSTRAINT "TradeOfferEvent_tradeOfferId_fkey" FOREIGN KEY ("tradeOfferId") REFERENCES "TradeOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeOfferEvent" ADD CONSTRAINT "TradeOfferEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveRoom" ADD CONSTRAINT "LiveRoom_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveRoomTeamBoard" ADD CONSTRAINT "LiveRoomTeamBoard_liveRoomId_fkey" FOREIGN KEY ("liveRoomId") REFERENCES "LiveRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveRoomTeamBoard" ADD CONSTRAINT "LiveRoomTeamBoard_currentPickerUserId_fkey" FOREIGN KEY ("currentPickerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveRoomTeamBoardPick" ADD CONSTRAINT "LiveRoomTeamBoardPick_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveRoomTeamBoardPick" ADD CONSTRAINT "LiveRoomTeamBoardPick_liveRoomId_fkey" FOREIGN KEY ("liveRoomId") REFERENCES "LiveRoomTeamBoard"("liveRoomId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveRoomItem" ADD CONSTRAINT "LiveRoomItem_liveRoomId_fkey" FOREIGN KEY ("liveRoomId") REFERENCES "LiveRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveRoomItem" ADD CONSTRAINT "LiveRoomItem_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakSpot" ADD CONSTRAINT "BreakSpot_liveRoomId_fkey" FOREIGN KEY ("liveRoomId") REFERENCES "LiveRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakSpot" ADD CONSTRAINT "BreakSpot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakHit" ADD CONSTRAINT "BreakHit_liveRoomId_fkey" FOREIGN KEY ("liveRoomId") REFERENCES "LiveRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakHit" ADD CONSTRAINT "BreakHit_liveRoomItemId_fkey" FOREIGN KEY ("liveRoomItemId") REFERENCES "LiveRoomItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakHit" ADD CONSTRAINT "BreakHit_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HitClip" ADD CONSTRAINT "HitClip_liveRoomId_fkey" FOREIGN KEY ("liveRoomId") REFERENCES "LiveRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HitClip" ADD CONSTRAINT "HitClip_breakHitId_fkey" FOREIGN KEY ("breakHitId") REFERENCES "BreakHit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HitClip" ADD CONSTRAINT "HitClip_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HitClip" ADD CONSTRAINT "HitClip_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveRoomMessage" ADD CONSTRAINT "LiveRoomMessage_liveRoomId_fkey" FOREIGN KEY ("liveRoomId") REFERENCES "LiveRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveRoomMessage" ADD CONSTRAINT "LiveRoomMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingImage" ADD CONSTRAINT "ListingImage_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_bidderId_fkey" FOREIGN KEY ("bidderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_liveShippingSessionId_fkey" FOREIGN KEY ("liveShippingSessionId") REFERENCES "LiveShippingSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_buyerAddressId_fkey" FOREIGN KEY ("buyerAddressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_sellerShipFromAddressId_fkey" FOREIGN KEY ("sellerShipFromAddressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveShippingSession" ADD CONSTRAINT "LiveShippingSession_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveShippingSession" ADD CONSTRAINT "LiveShippingSession_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveShippingSession" ADD CONSTRAINT "LiveShippingSession_liveShowId_fkey" FOREIGN KEY ("liveShowId") REFERENCES "LiveRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveShippingSessionItem" ADD CONSTRAINT "LiveShippingSessionItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveShippingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveShippingSessionItem" ADD CONSTRAINT "LiveShippingSessionItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveShippingSessionItem" ADD CONSTRAINT "LiveShippingSessionItem_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageThread" ADD CONSTRAINT "MessageThread_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageThread" ADD CONSTRAINT "MessageThread_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageThread" ADD CONSTRAINT "MessageThread_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MessageThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
