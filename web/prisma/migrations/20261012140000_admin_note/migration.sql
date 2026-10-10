-- Private admin notes (additive: new table only).
CREATE TABLE IF NOT EXISTS "AdminNote" (
    "id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AdminNote_targetType_targetId_createdAt_idx" ON "AdminNote"("targetType", "targetId", "createdAt");

ALTER TABLE "AdminNote" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "AdminNote" FROM anon, authenticated;
