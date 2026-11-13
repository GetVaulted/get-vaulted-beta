-- Backup live-video provider (Cloudflare Stream). Additive only; nothing changes until an admin enables it.
ALTER TYPE "LiveStreamProvider" ADD VALUE IF NOT EXISTS 'cloudflare_stream';
ALTER TABLE "LiveRoom" ADD COLUMN IF NOT EXISTS "externalStreamId" TEXT;
