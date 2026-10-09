-- Seller applications (additive: new enum + new table only; no existing table is altered).
CREATE TYPE "SellerApplicationStatus" AS ENUM ('pending', 'info_requested', 'approved', 'rejected', 'revoked');

CREATE TABLE "SellerApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "SellerApplicationStatus" NOT NULL DEFAULT 'pending',
    "whatTheySell" TEXT NOT NULL DEFAULT '',
    "whereTheySellNow" TEXT NOT NULL DEFAULT '',
    "experience" TEXT NOT NULL DEFAULT '',
    "monthlyVolume" TEXT NOT NULL DEFAULT '',
    "adminNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "grandfathered" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerApplication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SellerApplication_userId_key" ON "SellerApplication"("userId");

CREATE INDEX "SellerApplication_status_submittedAt_idx" ON "SellerApplication"("status", "submittedAt");

ALTER TABLE "SellerApplication" ADD CONSTRAINT "SellerApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Grandfather everyone who is already selling: set up the seller wizard, owns a listing, or has hosted a live room.
-- Nothing is enforced until SELLER_APPLICATIONS_ENFORCED is turned on, and admins can revoke anyone afterwards.
INSERT INTO "SellerApplication" ("id", "userId", "status", "grandfathered", "adminNote", "reviewedAt", "submittedAt", "createdAt", "updatedAt")
SELECT
    'gf_' || u."id",
    u."id",
    'approved'::"SellerApplicationStatus",
    true,
    'Grandfathered: already selling before applications launched.',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "User" u
WHERE u."accountDeletedAt" IS NULL
  AND (
    u."sellerSetupWizardCompletedAt" IS NOT NULL
    OR EXISTS (SELECT 1 FROM "Listing" l WHERE l."sellerId" = u."id")
    OR EXISTS (SELECT 1 FROM "LiveRoom" r WHERE r."sellerId" = u."id")
  )
ON CONFLICT ("userId") DO NOTHING;
