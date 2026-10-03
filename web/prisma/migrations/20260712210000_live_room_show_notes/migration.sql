-- Separate in-room show notes from public description.
ALTER TABLE "LiveRoom" ADD COLUMN IF NOT EXISTS "showNotes" TEXT NOT NULL DEFAULT '';

-- Preserve notes previously stored in description.
UPDATE "LiveRoom"
SET "showNotes" = "description"
WHERE COALESCE(TRIM("description"), '') <> ''
  AND COALESCE(TRIM("showNotes"), '') = '';
