-- Targeted seller lock: blocks going live and every payout path until an admin lifts it.
-- Additive and nullable: existing rows are unlocked. Login, shipping and messaging are NOT affected.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sellerLockedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sellerLockReason" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sellerLockedById" TEXT;
CREATE INDEX IF NOT EXISTS "User_sellerLockedAt_idx" ON "User"("sellerLockedAt");
