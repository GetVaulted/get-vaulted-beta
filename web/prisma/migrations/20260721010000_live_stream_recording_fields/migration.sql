-- LiveStreamReplay: IVS auto-recording status + S3 archive fields

CREATE TYPE "LiveStreamRecordingStatus" AS ENUM ('pending', 'recording', 'ready', 'failed', 'expired');
CREATE TYPE "LiveStreamArchiveStatus" AS ENUM ('none', 'preparing', 'ready', 'failed');

ALTER TABLE "LiveStreamReplay" ADD COLUMN "recordingStatus" "LiveStreamRecordingStatus" NOT NULL DEFAULT 'pending';
ALTER TABLE "LiveStreamReplay" ADD COLUMN "s3Bucket" TEXT;
ALTER TABLE "LiveStreamReplay" ADD COLUMN "s3KeyPrefix" TEXT;
ALTER TABLE "LiveStreamReplay" ADD COLUMN "hlsMasterKey" TEXT;
ALTER TABLE "LiveStreamReplay" ADD COLUMN "archiveS3Key" TEXT;
ALTER TABLE "LiveStreamReplay" ADD COLUMN "archiveStatus" "LiveStreamArchiveStatus" NOT NULL DEFAULT 'none';
ALTER TABLE "LiveStreamReplay" ADD COLUMN "recordingError" TEXT;
ALTER TABLE "LiveStreamReplay" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "LiveStreamReplay_recordingStatus_createdAt_idx" ON "LiveStreamReplay"("recordingStatus", "createdAt");
CREATE INDEX "LiveStreamReplay_archiveStatus_updatedAt_idx" ON "LiveStreamReplay"("archiveStatus", "updatedAt");
