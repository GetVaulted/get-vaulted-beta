-- Admin-controlled switches (additive: new table only).
CREATE TABLE IF NOT EXISTS "AdminSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminSetting_pkey" PRIMARY KEY ("key")
);

ALTER TABLE "AdminSetting" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "AdminSetting" FROM anon, authenticated;
