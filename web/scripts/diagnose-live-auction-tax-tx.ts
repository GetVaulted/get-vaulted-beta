/**
 * Diagnose live-auction TX sales tax: nexus flag + recent live order tax fields.
 * Usage: npx tsx scripts/diagnose-live-auction-tax-tx.ts
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

async function main() {
  const { createPostgresPrismaClient } = await import("../src/lib/prisma-pg-factory");
  const { resolveDatabaseUrl, redactDatabaseUrl } = await import("../src/lib/resolve-database-url");
  const { isStripeTaxFeatureEnabled } = await import("../src/lib/stripe-tax");

  console.log("stripe tax feature enabled:", isStripeTaxFeatureEnabled());
  console.log("db:", redactDatabaseUrl(resolveDatabaseUrl()));

  const prisma = createPostgresPrismaClient(resolveDatabaseUrl());
  try {
    const tx = await prisma.taxNexusState.findUnique({
      where: { stateCode: "TX" },
      select: { stateCode: true, enabled: true, collectionBasis: true, label: true, notes: true },
    });
    console.log("TX nexus row:", tx);

    const allEnabled = await prisma.taxNexusState.findMany({
      where: { enabled: true },
      select: { stateCode: true, enabled: true, collectionBasis: true },
      orderBy: { stateCode: "asc" },
    });
    console.log("enabled nexus states:", allEnabled);

    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const liveOrders = await prisma.order.findMany({
      where: {
        createdAt: { gte: since },
        OR: [
          { liveShippingSessionId: { not: null } },
          { inventoryHolds: { some: { source: "auction_win_order" } } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        createdAt: true,
        itemPriceUsd: true,
        shippingPriceUsd: true,
        taxUsd: true,
        taxAmountCents: true,
        totalUsd: true,
        shipState: true,
        shipZip: true,
        shipCity: true,
        paymentStatus: true,
        taxJurisdictionState: true,
        taxCollectionBasis: true,
        stripeTaxCalculationId: true,
      },
    });
    console.log("recent live/auction orders:", JSON.stringify(liveOrders, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
