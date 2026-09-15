/**
 * Pre-deploy migration readiness checks against the configured database.
 * Read-only: does not apply the migration or mutate business data.
 *
 * Usage: npx tsx scripts/validate-shipment-label-finance-migration.ts
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const enumConflicts = await prisma.$queryRawUnsafe<Array<{ typname: string }>>(
    `SELECT typname FROM pg_type WHERE typname IN ('ShipmentLabelFinancePurpose','ShipmentLabelFinanceStatus')`,
  );
  const tableExists = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'ShipmentLabelFinance'
     ) AS exists`,
  );
  const orderCount = await prisma.order.count();
  const packageCount = await prisma.shipmentPackage.count();
  const labeledOrders = await prisma.order.count({
    where: {
      OR: [
        { shippingLabelCostCents: { gt: 0 } },
        { shippingLabelCostReversedCents: { gt: 0 } },
        { shippoTransactionId: { not: null } },
      ],
    },
  });

  // Duplicate Shippo txs per order on packages — unique (orderId, shippoTransactionId) only applies
  // after backfill; package rows themselves are not constrained by this migration.
  const sessionDupes = await prisma.$queryRawUnsafe<Array<{ liveShippingSessionId: string; shippoTransactionId: string; c: bigint }>>(
    `SELECT "liveShippingSessionId", "shippoTransactionId", COUNT(*)::bigint AS c
     FROM "ShipmentPackage"
     WHERE "shippoTransactionId" IS NOT NULL AND "liveShippingSessionId" IS NOT NULL
     GROUP BY 1, 2
     HAVING COUNT(*) > 1
     LIMIT 20`,
  );

  const report = {
    mode: "MIGRATION_READINESS_READONLY",
    destructiveToOrderOrPackage: false,
    tableAlreadyExists: Boolean(tableExists[0]?.exists),
    enumNameConflicts: enumConflicts.map((e) => e.typname),
    canApplyCleanly: enumConflicts.length === 0 && !tableExists[0]?.exists,
    existingOrderCount: orderCount,
    existingShipmentPackageCount: packageCount,
    labeledOrderCount: labeledOrders,
    note:
      "Migration only CREATE TYPE/TABLE/INDEX/FK. Existing Order/ShipmentPackage rows are untouched. FK failures cannot occur on empty new table. Unique (orderId, shippoTransactionId) is empty until backfill.",
    duplicatePackageShippoTxInSessions: sessionDupes.map((d) => ({
      liveShippingSessionId: d.liveShippingSessionId,
      shippoTransactionId: d.shippoTransactionId,
      count: Number(d.c),
    })),
    rollbackPlan: {
      ifAppDeployFailsAfterDbMigrate:
        "Safe: leave table in place (unused by old app code). Or `prisma migrate resolve` + DROP TABLE/TYPE in a reverse migration. Order money fields unchanged by this migration.",
      ifBackfillFails: "Delete ShipmentLabelFinance rows; Order summaries unchanged until recalculate runs.",
      prismaRerunSafety:
        "Normal `prisma migrate deploy` is idempotent via _prisma_migrations; re-running applied migration is a no-op.",
    },
    requiredIndexes: [
      "ShipmentLabelFinance_orderId_idx",
      "ShipmentLabelFinance_shipmentPackageId_key",
      "ShipmentLabelFinance_shippoTransactionId_idx",
      "ShipmentLabelFinance_orderId_status_idx",
      "ShipmentLabelFinance_sellerClawbackReversalId_idx",
      "ShipmentLabelFinance_sellerCreditTransferId_idx",
    ],
  };

  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
