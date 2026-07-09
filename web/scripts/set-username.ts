/**
 * Set a user's public username (bypasses signup policy — for support / one-off fixes).
 *
 * Usage (from web/):
 *   npx tsx scripts/set-username.ts admin@shopgetvaulted.com getvaulted --yes
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPostgresPrismaClient } from "../src/lib/prisma-pg-factory";
import { parseDatabaseConnectionInfo, redactDatabaseUrl, resolveDatabaseUrl } from "../src/lib/resolve-database-url";
import { findProductionHostEnvVar } from "../src/lib/production-host-guard";
import { syncSupabaseProfileUsername } from "../src/lib/sync-profile-username";
import { normalizeUsernameForStorage } from "../src/lib/username-policy";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "..", ".env"), quiet: true });
config({ path: path.join(__dirname, "..", ".env.local"), override: true, quiet: true });

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--yes");
  const confirmed = process.argv.includes("--yes") || process.env.CONFIRM_SET_USERNAME === "1";
  const email = args[0]?.trim().toLowerCase();
  const rawUsername = args[1]?.trim();
  if (!email || !rawUsername) {
    console.error("Usage: npx tsx scripts/set-username.ts <email> <username> --yes");
    process.exit(1);
  }

  const username = normalizeUsernameForStorage(rawUsername);
  const dbUrl = resolveDatabaseUrl();
  const conn = parseDatabaseConnectionInfo(dbUrl);
  const prodHostVar = findProductionHostEnvVar();

  console.log("=".repeat(72));
  console.log("SET USERNAME");
  console.log(`Target email:      ${email}`);
  console.log(`New username:      ${username}`);
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
    console.error("\nRefusing: re-run with --yes once you've confirmed the target above is correct.");
    process.exit(1);
  }

  const prisma = createPostgresPrismaClient(dbUrl);
  try {
    const before = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true, email: true, username: true, role: true },
    });
    if (!before) {
      console.error(`No User row found for ${email}`);
      process.exit(1);
    }

    const taken = await prisma.user.findFirst({
      where: { username, NOT: { id: before.id } },
      select: { id: true, email: true },
    });
    if (taken) {
      console.error(`Username "${username}" is already taken by ${taken.email}`);
      process.exit(1);
    }

    const after = await prisma.user.update({
      where: { id: before.id },
      data: { username, usernameChosenAt: new Date() },
      select: { id: true, email: true, username: true, role: true, usernameChosenAt: true },
    });

    await syncSupabaseProfileUsername(after.id, after.username);

    console.log("Username updated:");
    console.log(JSON.stringify({ before, after }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
