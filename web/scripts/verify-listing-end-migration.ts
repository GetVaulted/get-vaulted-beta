import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const enums = await prisma.$queryRaw<{ v: string }[]>`
    SELECT unnest(enum_range(NULL::"ListingStatus"))::text AS v
  `;
  console.log(
    "ListingStatus:",
    enums.map((r) => r.v).join(", "),
  );
  const tables = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name LIKE 'ListingEnd%'
    ORDER BY table_name
  `;
  console.log("ListingEnd tables:", tables.map((t) => t.table_name).join(", ") || "(none)");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
