/**
 * Promote a user to admin by email.
 *
 * Grants full admin access (finance, moderation, user management — see `requireAdmin`), so this
 * always prints which database/host it is about to mutate and requires an explicit `--yes` before
 * touching anything. There's no separate "beta-only" project-ref check here (unlike the
 * beta-wipe/beta-qa scripts): this script is legitimately used against production too. The goal
 * is to make the *target* impossible to miss, not to block production.
 *
 * Usage (from web/):
 *   npx tsx scripts/promote-user-admin.ts brysmith31@icloud.com --yes
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPostgresPrismaClient } from "../src/lib/prisma-pg-factory";
import { parseDatabaseConnectionInfo, redactDatabaseUrl, resolveDatabaseUrl } from "../src/lib/resolve-database-url";
import { findProductionHostEnvVar } from "../src/lib/production-host-guard";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "..", ".env"), quiet: true });
config({ path: path.join(__dirname, "..", ".env.local"), override: true, quiet: true });

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--yes");
  const confirmed = process.argv.includes("--yes") || process.env.CONFIRM_PROMOTE_ADMIN === "1";
  const email = args[0]?.trim().toLowerCase();
  if (!email) {
    console.error("Usage: npx tsx scripts/promote-user-admin.ts <email> --yes");
    process.exit(1);
  }

  const dbUrl = resolveDatabaseUrl();
  const conn = parseDatabaseConnectionInfo(dbUrl);
  const prodHostVar = findProductionHostEnvVar();

  console.log("=".repeat(72));
  console.log("PROMOTE USER TO ADMIN");
  console.log(`Target email:      ${email}`);
  console.log(`Database host:     ${conn.host}`);
  console.log(`Supabase project:  ${conn.projectRef ?? "(unknown)"}`);
  console.log(`Database URL:      ${redactDatabaseUrl(dbUrl)}`);
  console.log(
    prodHostVar
      ? `Environment:       PRODUCTION (${prodHostVar} points at the live apex domain)`
      : "Environment:       not detected as production (beta/local/unknown — verify DATABASE_URL yourself)",
  );
  console.log("=".repeat(72));

  if (!confirmed) {
    console.error(
      "\nRefusing: re-run with --yes (or CONFIRM_PROMOTE_ADMIN=1) once you've confirmed the target above is correct.",
    );
    console.error("Admin grants full access to finance, moderation, and user management — double-check the email and database before confirming.");
    process.exit(1);
  }

  const prisma = createPostgresPrismaClient(dbUrl);
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
