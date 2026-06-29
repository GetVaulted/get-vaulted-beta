-- CreateEnum
CREATE TYPE "LiveRoomDiscoveryVisibility" AS ENUM ('public', 'private');

-- AlterTable
ALTER TABLE "LiveRoom" ADD COLUMN "discoveryVisibility" "LiveRoomDiscoveryVisibility" NOT NULL DEFAULT 'public';
