-- In-app backup live video: Agora Media Push converter id + a flag marking a phone-sourced non-AWS stream.
-- Additive; nothing changes until an admin enables the backup provider.
ALTER TABLE "LiveRoom" ADD COLUMN IF NOT EXISTS "externalRelayId" TEXT;
ALTER TABLE "LiveRoom" ADD COLUMN IF NOT EXISTS "phoneRelay" BOOLEAN NOT NULL DEFAULT false;
