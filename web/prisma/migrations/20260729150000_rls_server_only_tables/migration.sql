-- Server-only Prisma tables in public schema. Enable RLS with no policies so
-- anon/authenticated PostgREST clients cannot read/write; Prisma (table owner /
-- service connection) continues to bypass RLS.
ALTER TABLE "UserAppPresence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ShipmentLabelFinance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProcessedPayPalEvent" ENABLE ROW LEVEL SECURITY;
