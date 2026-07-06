-- Bug fix (2026-07): mass-notification broadcast had no idempotency guard — a replayed/
-- double-submitted POST (double-click, retried request) would fan out duplicate
-- notifications + pushes to the entire user base.
--
-- `idempotencyKey` is generated once per compose+send attempt in the admin UI. The unique
-- constraint below is the actual guard: `sendMassNotification` reserves a row with this key
-- BEFORE sending anything, so a concurrent/retried request with the same key hits the
-- constraint and safely replays the original result instead of sending again.
ALTER TABLE "NotificationBroadcast" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "NotificationBroadcast_idempotencyKey_key" ON "NotificationBroadcast"("idempotencyKey");
