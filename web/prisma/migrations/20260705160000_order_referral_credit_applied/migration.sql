-- Referral credit program (2026-07), part 2: buyer-facing/audit field recording how much
-- referral credit was applied to a given order's charge. Informational only — the ledger source
-- of truth is `ReferralCredit` rows with `spentOrderId` equal to this order's id.
ALTER TABLE "Order" ADD COLUMN "referralCreditAppliedUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
