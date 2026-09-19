-- Freshness for discovery viewer counts (presence cache must not stay inflated forever).
ALTER TABLE "LiveRoom" ADD COLUMN IF NOT EXISTS "viewerCountUpdatedAt" TIMESTAMP(3);
