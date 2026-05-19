/**
 * One-off audit: print near-duplicate active listings and Megatron rows.
 *   npx tsx scripts/audit-duplicate-listings.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const WINDOW_MS = Number(process.env.DUPLICATE_WINDOW_MS ?? 120_000);

function sig(urls: string[]): string {
  return [...urls]
    .map((u) => u.trim())
    .filter(Boolean)
    .sort()
    .join("\0");
}

async function main() {
  const megatron = await prisma.listing.findMany({
    where: {
      title: { contains: "Megatron", mode: "insensitive" },
      status: { in: ["active", "auction_live"] },
    },
    select: {
      id: true,
      sellerId: true,
      title: true,
      createdAt: true,
      status: true,
      images: { select: { url: true, sortOrder: true }, orderBy: { sortOrder: "asc" } },
      _count: { select: { orders: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  console.log(`\n=== Megatron active listings: ${megatron.length} ===`);
  for (const r of megatron) {
    console.log({
      id: r.id,
      sellerId: r.sellerId,
      createdAt: r.createdAt.toISOString(),
      orders: r._count.orders,
      hero: r.images[0]?.url ?? "(none)",
      imageCount: r.images.length,
    });
  }

  const all = await prisma.listing.findMany({
    where: { status: { in: ["active", "auction_live"] } },
    select: {
      id: true,
      sellerId: true,
      title: true,
      createdAt: true,
      images: { select: { url: true, sortOrder: true }, orderBy: { sortOrder: "asc" } },
      _count: { select: { orders: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const buckets = new Map<string, (typeof all)[number][]>();
  for (const row of all) {
    const key = `${row.sellerId}\0${row.title.trim().toLowerCase()}\0${sig(row.images.map((i) => i.url))}`;
    const list = buckets.get(key) ?? [];
    list.push(row);
    buckets.set(key, list);
  }

  let clusters = 0;
  console.log(`\n=== Duplicate clusters (same seller/title/images, within ${WINDOW_MS}ms) ===`);
  for (const group of buckets.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const span = sorted[0]!.createdAt.getTime() - sorted[sorted.length - 1]!.createdAt.getTime();
    if (span > WINDOW_MS) continue;
    clusters += 1;
    console.log(`\n· "${sorted[0]!.title}" x${sorted.length} (span ${Math.round(span / 1000)}s)`);
    for (const r of sorted) {
      console.log(
        `  ${r.id}  ${r.createdAt.toISOString()}  orders=${r._count.orders}  keep=${r === sorted[0]}`,
      );
    }
  }
  console.log(`\nTotal clusters (strict: same images): ${clusters}`);

  console.log(`\n=== Loose clusters (same seller + title, within ${WINDOW_MS}ms, images may differ) ===`);
  const titleBuckets = new Map<string, (typeof all)[number][]>();
  for (const row of all) {
    const key = `${row.sellerId}\0${row.title.trim().toLowerCase()}`;
    const list = titleBuckets.get(key) ?? [];
    list.push(row);
    titleBuckets.set(key, list);
  }
  let loose = 0;
  for (const group of titleBuckets.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const span = sorted[0]!.createdAt.getTime() - sorted[sorted.length - 1]!.createdAt.getTime();
    if (span > WINDOW_MS) continue;
    loose += 1;
    console.log(`\n· "${sorted[0]!.title}" x${sorted.length} (span ${Math.round(span / 1000)}s) — images differ across rows`);
    for (const r of sorted) {
      const hero = r.images[0]?.url?.split("/").pop() ?? "?";
      console.log(
        `  ${r.id}  ${r.createdAt.toISOString()}  orders=${r._count.orders}  hero=…${hero}`,
      );
    }
  }
  console.log(`\nLoose clusters (manual review only): ${loose}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
