-- Admin change log (additive: new table only, safe on a live database).
CREATE TABLE IF NOT EXISTS "AdminActionLog" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetUserId" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminActionLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AdminActionLog_createdAt_idx" ON "AdminActionLog"("createdAt");
CREATE INDEX IF NOT EXISTS "AdminActionLog_targetType_targetId_createdAt_idx" ON "AdminActionLog"("targetType", "targetId", "createdAt");
CREATE INDEX IF NOT EXISTS "AdminActionLog_targetUserId_createdAt_idx" ON "AdminActionLog"("targetUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "AdminActionLog_adminUserId_createdAt_idx" ON "AdminActionLog"("adminUserId", "createdAt");

-- Server-only table: lock out the public API (no policies = no access for anon/authenticated).
ALTER TABLE "AdminActionLog" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "AdminActionLog" FROM anon, authenticated;
