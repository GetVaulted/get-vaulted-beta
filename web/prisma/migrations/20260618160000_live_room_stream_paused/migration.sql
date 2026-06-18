-- Host can pause the live video feed without ending the show.
ALTER TABLE "LiveRoom" ADD COLUMN "streamPaused" BOOLEAN NOT NULL DEFAULT false;
