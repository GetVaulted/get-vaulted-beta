-- Assigned moderators need show-level permissions (pin, announcements) by default.
UPDATE "LiveRoomModerator"
SET "moderatorLevel" = 'show'
WHERE "revokedAt" IS NULL AND "moderatorLevel" = 'chat';

ALTER TABLE "LiveRoomModerator" ALTER COLUMN "moderatorLevel" SET DEFAULT 'show';
