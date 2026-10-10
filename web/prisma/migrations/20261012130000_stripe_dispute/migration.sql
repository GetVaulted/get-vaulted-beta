-- Stripe disputes mirrored locally so admins can work them by due date (additive: new table only).
CREATE TABLE IF NOT EXISTS "StripeDispute" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "chargeId" TEXT NOT NULL,
    "paymentIntentId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "reason" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL,
    "evidenceDueBy" TIMESTAMP(3),
    "hasEvidence" BOOLEAN NOT NULL DEFAULT false,
    "submissionCount" INTEGER NOT NULL DEFAULT 0,
    "pastDue" BOOLEAN NOT NULL DEFAULT false,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "adminNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StripeDispute_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StripeDispute_status_evidenceDueBy_idx" ON "StripeDispute"("status", "evidenceDueBy");
CREATE INDEX IF NOT EXISTS "StripeDispute_orderId_idx" ON "StripeDispute"("orderId");

ALTER TABLE "StripeDispute" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "StripeDispute" FROM anon, authenticated;
