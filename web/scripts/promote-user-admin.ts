/**
 * Promote a user to admin by email.
 *
 * Usage (from web/):
 *   npx tsx scripts/promote-user-admin.ts brysmith31@icloud.com
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPostgresPrismaClient } from "../src/lib/prisma-pg-factory";
import { resolveDatabaseUrl } from "../src/lib/resolve-database-url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "..", ".env"), quiet: true });
config({ path: path.join(__dirname, "..", ".env.local"), override: true, quiet: true });

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Usage: npx tsx scripts/promote-user-admin.ts <email>");
    process.exit(1);
  }

  const prisma = createPostgresPrismaClient(resolveDatabaseUrl());
  try {
    const before = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true, email: true, username: true, role: true, suspendedAt: true },
    });
    if (!before) {
      console.error(`No User row found for ${email}`);
      process.exit(1);
    }

    const after = await prisma.user.update({
      where: { id: before.id },
      data: { role: "admin" },
      select: { id: true, email: true, username: true, role: true, suspendedAt: true },
    });

    console.log("Promoted to admin:");
    console.log(JSON.stringify({ before, after }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
