-- When the host paused the live video feed. Additive; NULL for rooms not currently paused.
ALTER TABLE "LiveRoom" ADD COLUMN IF NOT EXISTS "streamPausedAt" TIMESTAMP(3);
