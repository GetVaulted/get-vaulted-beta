-- Short looping promo video for scheduled live rooms (seller-uploaded before go-live).
ALTER TABLE "LiveRoom" ADD COLUMN IF NOT EXISTS "teaserVideoUrl" TEXT;
ALTER TABLE "LiveRoom" ADD COLUMN IF NOT EXISTS "teaserVideoDurationMs" INTEGER;
