/**
 * Diagnose GET /api/account/seller Prisma queries against the configured DATABASE_URL.
 *
 * Usage (from web/):
 *   npm run qa:diagnose-account-seller
 *   npm run qa:diagnose-account-seller -- --email sellerqa@getvaultedtest.com
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPostgresPrismaClient } from "../src/lib/prisma-pg-factory";
import { serializePrismaClientError } from "../src/lib/prisma-client-error-serialize";
import { redactDatabaseUrl, resolveDatabaseUrl } from "../src/lib/resolve-database-url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

const DEFAULT_EMAIL = "sellerqa@getvaultedtest.com";

function parseEmailArg(): string {
  const idx = process.argv.indexOf("--email");
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1]!.trim().toLowerCase();
  return DEFAULT_EMAIL;
}

type Probe = { label: string; ok: boolean; detail: string };

async function probe(label: string, fn: () => Promise<unknown>): Promise<Probe> {
  try {
    const result = await fn();
    const detail =
      typeof result === "number" || typeof result === "boolean"
        ? String(result)
        : Array.isArray(result)
          ? `${result.length} row(s)`
          : result && typeof result === "object" && "id" in result
            ? `id ${(result as { id: string }).id}`
            : "ok";
    return { label, ok: true, detail };
  } catch (e) {
    const pe = serializePrismaClientError(e);
    return { label, ok: false, detail: `${pe.code ?? pe.name}: ${pe.message}` };
  }
}

async function main() {
  const email = parseEmailArg();
  const dbUrl = resolveDatabaseUrl();
  console.log(`=== Diagnose account/seller (${email}) ===`);
  console.log(`Database: ${redactDatabaseUrl(dbUrl)}\n`);

  const prisma = createPostgresPrismaClient(dbUrl);

  const users = await prisma.user.findMany({
    where: { email },
    select: { id: true, username: true },
  });
  if (!users.length) {
    console.error(`No User row for ${email}. Run ALLOW_BETA_QA_SEED=1 npm run qa:seed-beta-accounts`);
    process.exit(1);
  }
  if (users.length > 1) {
    console.warn(`Warning: ${users.length} User rows for ${email} — using first (${users[0]!.id})`);
  }
  const userId = users[0]!.id;
  console.log(`Seller userId: ${userId} (@${users[0]!.username})\n`);

  const probes: Probe[] = [];
  probes.push(await probe("User.findUnique", () => prisma.user.findUniqueOrThrow({ where: { id: userId } })));
  probes.push(
    await probe("Order.findMany (recent)", () =>
      prisma.order.findMany({ where: { sellerId: userId }, take: 5, select: { id: true } }),
    ),
  );
  probes.push(
    await probe("Listing.count auction_ended_unpaid", () =>
      prisma.listing.count({ where: { sellerId: userId, status: "auction_ended_unpaid" } }),
    ),
  );
  probes.push(
    await probe("SellerCommerceEvent.findMany", () =>
      prisma.sellerCommerceEvent.findMany({ where: { sellerId: userId }, take: 5 }),
    ),
  );
  probes.push(
    await probe("Address.findMany ship_from", () =>
      prisma.address.findMany({ where: { userId, type: "ship_from" }, take: 5 }),
    ),
  );
  probes.push(
    await probe("Message.count unread", () =>
      prisma.message.count({ where: { recipientId: userId, readAt: null } }),
    ),
  );
  probes.push(
    await probe("LiveRoom.findFirst", () =>
      prisma.liveRoom.findFirst({
        where: { sellerId: userId, status: { in: ["live", "scheduled"] } },
        select: { id: true },
      }),
    ),
  );

  for (const p of probes) {
    console.log(`${p.ok ? "✓" : "✗"} ${p.label}: ${p.detail}`);
  }

  console.log("\n--- loadAccountSellerPayload ---");
  try {
    const { loadAccountSellerPayload } = await import("../src/lib/load-account-seller-payload");
    const payload = await loadAccountSellerPayload(userId);
    console.log("✓ Full payload loaded");
    console.log(`  activeListings: ${payload.sellerHomeStats.activeListingsCount}`);
    console.log(`  commerceEvents: ${payload.commerceEvents.length}`);
    if (payload.partialErrors?.length) {
      console.log("  partialErrors:");
      for (const err of payload.partialErrors) console.log(`    - ${err}`);
    }
  } catch (e) {
    const pe = serializePrismaClientError(e);
    console.error(`✗ Payload failed: ${pe.code ?? pe.name} ${pe.message}`);
    process.exit(1);
  }

  await prisma.$disconnect();
  const failed = probes.filter((p) => !p.ok);
  if (failed.length) {
    console.log(`\n${failed.length} probe(s) failed — likely missing migration or schema drift on this database.`);
    process.exit(1);
  }
  console.log("\nAll probes passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
