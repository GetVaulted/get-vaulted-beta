-- Public profile fields (additive, all nullable): short bio, banner image, social links.
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "profileBio" TEXT,
ADD COLUMN     "profileBannerUrl" TEXT,
ADD COLUMN     "profileLinks" JSONB;
