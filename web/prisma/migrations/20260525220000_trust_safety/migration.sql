-- Trust & safety: reports, live moderation, replays, dispute evidence

CREATE TYPE "ReportTargetType" AS ENUM ('user', 'listing', 'live_room', 'message', 'order', 'break');
CREATE TYPE "ReportReason" AS ENUM ('harassment', 'counterfeit', 'scam_fraud', 'spam', 'inappropriate_content', 'fake_bids', 'seller_misconduct', 'buyer_misconduct', 'ip_violation', 'other');
CREATE TYPE "ReportStatus" AS ENUM ('open', 'reviewing', 'resolved', 'dismissed');
CREATE TYPE "LiveRoomModerationActionType" AS ENUM ('mute', 'unmute', 'delete_message', 'kick', 'room_ban', 'unban', 'block_bidding', 'unblock_bidding', 'slow_mode', 'pin_message');
CREATE TYPE "DisputeEvidenceStatus" AS ENUM ('pending', 'ready', 'failed');

ALTER TABLE "LiveRoom" ADD COLUMN "slowModeSeconds" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LiveRoom" ADD COLUMN "pinnedModeratorMessage" TEXT;
ALTER TABLE "LiveRoom" ADD COLUMN "pinnedModeratorMessageAt" TIMESTAMP(3);

ALTER TABLE "LiveRoomMessage" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "LiveRoomMessage" ADD COLUMN "deletedByUserId" TEXT;
ALTER TABLE "LiveRoomMessage" ADD CONSTRAINT "LiveRoomMessage_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reporterUserId" TEXT NOT NULL,
    "targetType" "ReportTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "ReportStatus" NOT NULL DEFAULT 'open',
    "assignedAdminId" TEXT,
    "moderationNotes" TEXT NOT NULL DEFAULT '',
    "liveRoomId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReportAuditLog" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReportAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LiveRoomModerator" (
    "id" TEXT NOT NULL,
    "liveRoomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedByUserId" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LiveRoomModerator_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LiveRoomModerationAction" (
    "id" TEXT NOT NULL,
    "liveRoomId" TEXT NOT NULL,
    "targetUserId" TEXT,
    "moderatorUserId" TEXT NOT NULL,
    "actionType" "LiveRoomModerationActionType" NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "targetMessageId" TEXT,
    "metadata" JSONB,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LiveRoomModerationAction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LiveStreamReplay" (
    "id" TEXT NOT NULL,
    "liveRoomId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "streamSessionId" TEXT,
    "replayUrl" TEXT NOT NULL,
    "durationSeconds" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LiveStreamReplay_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DisputeEvidenceBundle" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "liveRoomId" TEXT,
    "reportId" TEXT,
    "generatedByAdminId" TEXT,
    "status" "DisputeEvidenceStatus" NOT NULL DEFAULT 'pending',
    "summaryJson" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DisputeEvidenceBundle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrustModerationAuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "liveRoomId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrustModerationAuditLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_assignedAdminId_fkey" FOREIGN KEY ("assignedAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_liveRoomId_fkey" FOREIGN KEY ("liveRoomId") REFERENCES "LiveRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ReportAuditLog" ADD CONSTRAINT "ReportAuditLog_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportAuditLog" ADD CONSTRAINT "ReportAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LiveRoomModerator" ADD CONSTRAINT "LiveRoomModerator_liveRoomId_fkey" FOREIGN KEY ("liveRoomId") REFERENCES "LiveRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LiveRoomModerator" ADD CONSTRAINT "LiveRoomModerator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LiveRoomModerator" ADD CONSTRAINT "LiveRoomModerator_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LiveRoomModerationAction" ADD CONSTRAINT "LiveRoomModerationAction_liveRoomId_fkey" FOREIGN KEY ("liveRoomId") REFERENCES "LiveRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LiveRoomModerationAction" ADD CONSTRAINT "LiveRoomModerationAction_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LiveRoomModerationAction" ADD CONSTRAINT "LiveRoomModerationAction_moderatorUserId_fkey" FOREIGN KEY ("moderatorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LiveStreamReplay" ADD CONSTRAINT "LiveStreamReplay_liveRoomId_fkey" FOREIGN KEY ("liveRoomId") REFERENCES "LiveRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LiveStreamReplay" ADD CONSTRAINT "LiveStreamReplay_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DisputeEvidenceBundle" ADD CONSTRAINT "DisputeEvidenceBundle_generatedByAdminId_fkey" FOREIGN KEY ("generatedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TrustModerationAuditLog" ADD CONSTRAINT "TrustModerationAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "LiveRoomModerator_liveRoomId_userId_key" ON "LiveRoomModerator"("liveRoomId", "userId");
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");
CREATE INDEX "Report_targetType_targetId_idx" ON "Report"("targetType", "targetId");
CREATE INDEX "Report_reporterUserId_createdAt_idx" ON "Report"("reporterUserId", "createdAt");
CREATE INDEX "Report_assignedAdminId_idx" ON "Report"("assignedAdminId");
CREATE INDEX "ReportAuditLog_reportId_createdAt_idx" ON "ReportAuditLog"("reportId", "createdAt");
CREATE INDEX "LiveRoomModerator_liveRoomId_revokedAt_idx" ON "LiveRoomModerator"("liveRoomId", "revokedAt");
CREATE INDEX "LiveRoomModerationAction_liveRoomId_targetUserId_createdAt_idx" ON "LiveRoomModerationAction"("liveRoomId", "targetUserId", "createdAt");
CREATE INDEX "LiveRoomModerationAction_liveRoomId_actionType_createdAt_idx" ON "LiveRoomModerationAction"("liveRoomId", "actionType", "createdAt");
CREATE INDEX "LiveStreamReplay_liveRoomId_createdAt_idx" ON "LiveStreamReplay"("liveRoomId", "createdAt");
CREATE INDEX "LiveStreamReplay_sellerId_createdAt_idx" ON "LiveStreamReplay"("sellerId", "createdAt");
CREATE INDEX "DisputeEvidenceBundle_orderId_createdAt_idx" ON "DisputeEvidenceBundle"("orderId", "createdAt");
CREATE INDEX "DisputeEvidenceBundle_liveRoomId_createdAt_idx" ON "DisputeEvidenceBundle"("liveRoomId", "createdAt");
CREATE INDEX "DisputeEvidenceBundle_reportId_createdAt_idx" ON "DisputeEvidenceBundle"("reportId", "createdAt");
CREATE INDEX "TrustModerationAuditLog_liveRoomId_createdAt_idx" ON "TrustModerationAuditLog"("liveRoomId", "createdAt");
CREATE INDEX "TrustModerationAuditLog_actorUserId_createdAt_idx" ON "TrustModerationAuditLog"("actorUserId", "createdAt");
CREATE INDEX "TrustModerationAuditLog_targetType_targetId_idx" ON "TrustModerationAuditLog"("targetType", "targetId");
