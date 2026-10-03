-- AlterTable Message: optional photo attachment for direct messages. Text and image may both
-- be present, or the message may be image-only (body stored as "").
ALTER TABLE "Message" ADD COLUMN "imageUrl" TEXT;
