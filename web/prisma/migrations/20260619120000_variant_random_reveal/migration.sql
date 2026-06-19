-- Random team/division assignment mode + purchase reveal labels

CREATE TYPE "LiveItemVariantAssignmentMode" AS ENUM ('pick', 'random');

ALTER TABLE "LiveRoomItem"
  ADD COLUMN "variantAssignmentMode" "LiveItemVariantAssignmentMode" NOT NULL DEFAULT 'pick';

ALTER TABLE "LiveItemVariantPurchase"
  ADD COLUMN "revealedLabel" TEXT,
  ADD COLUMN "revealedAbbr" TEXT;
