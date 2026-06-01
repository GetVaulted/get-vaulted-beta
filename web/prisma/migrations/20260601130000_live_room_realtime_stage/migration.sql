-- Live room IVS Real-Time (WebRTC Stage) support: stream mode discriminator + stage/composition ARNs.

CREATE TYPE "LiveStreamMode" AS ENUM ('stage_webrtc', 'channel_hls');

ALTER TABLE "LiveRoom" ADD COLUMN "streamMode" "LiveStreamMode" NOT NULL DEFAULT 'stage_webrtc';
ALTER TABLE "LiveRoom" ADD COLUMN "ivsStageArn" TEXT;
ALTER TABLE "LiveRoom" ADD COLUMN "ivsCompositionArn" TEXT;
