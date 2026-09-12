-- Zombie-live recovery: track when a live room's host WebRTC publisher first went absent.
ALTER TABLE "LiveRoom" ADD COLUMN IF NOT EXISTS "hostAbsentSince" TIMESTAMP(3);
