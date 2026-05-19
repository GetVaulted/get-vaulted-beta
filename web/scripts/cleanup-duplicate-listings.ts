/**
 * Find and remove duplicate marketplace listings (same seller, title, images, created close together).
 *
 *   npm run cleanup:duplicate-listings              # dry-run (default, strict: same images)
 *   npm run cleanup:duplicate-listings -- --loose   # dry-run: same seller+title within window (images may differ — double-publish re-uploads)
 *   npm run cleanup:duplicate-listings -- --apply   # delete (requires CONFIRM_DUPLICATE_CLEANUP=1)
 *
 * Keeps the newest row in each duplicate cluster (by createdAt).
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const WINDOW_MS = Number(process.env.DUPLICATE_WINDOW_MS ?? 120_000);
const APPLY = process.argv.includes("--apply");
const LOOSE = process.argv.includes("--loose");

function imageSignature(urls: string[]): string {
  return [...urls]
    .map((u) => u.trim())
    .filter(Boolean)
    .sort()
    .join("\0");
}

async function main() {
  const rows = await prisma.listing.findMany({
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

  type Row = (typeof rows)[number];
  const buckets = new Map<string, Row[]>();

  for (const row of rows) {
    const sig = imageSignature(row.images.map((im) => im.url));
    const key = LOOSE
      ? `${row.sellerId}\0${row.title.trim().toLowerCase()}`
      : `${row.sellerId}\0${row.title.trim().toLowerCase()}\0${sig}`;
    const list = buckets.get(key) ?? [];
    list.push(row);
    buckets.set(key, list);
  }

  const clusters: { keep: string; drop: string[]; title: string; sellerId: string }[] = [];
  const toDelete: Row[] = [];

  for (const [, group] of buckets) {
    if (group.length < 2) continue;

    const sorted = [...group].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const newest = sorted[0]!.createdAt.getTime();
    const oldest = sorted[sorted.length - 1]!.createdAt.getTime();
    if (newest - oldest > WINDOW_MS) {
      console.log(
        `[cleanup] skip wide time span (${Math.round((newest - oldest) / 1000)}s): "${sorted[0]!.title}" x${sorted.length}`,
      );
      continue;
    }

    const [keep, ...dupes] = sorted;
    const droppable = dupes.filter((d) => d._count.orders === 0);
    const blocked = dupes.filter((d) => d._count.orders > 0);

    if (blocked.length) {
      console.warn("[cleanup] skip duplicates with orders:", {
        keep: keep.id,
        blocked: blocked.map((d) => ({ id: d.id, orders: d._count.orders })),
      });
    }

    if (!droppable.length) continue;

    clusters.push({
      keep: keep.id,
      drop: droppable.map((d) => d.id),
      title: keep.title,
      sellerId: keep.sellerId,
    });
    toDelete.push(...droppable);
  }

  const uniqDelete = [...new Map(toDelete.map((r) => [r.id, r])).values()];

  console.log(`Mode: ${LOOSE ? "loose (seller+title+window)" : "strict (seller+title+images+window)"}`);
  console.log(`Duplicate clusters: ${clusters.length}`);
  console.log(`Listings to delete: ${uniqDelete.length} (window ${WINDOW_MS}ms, ${APPLY ? "APPLY" : "dry-run"})`);

  for (const c of clusters) {
    console.log(`\n· "${c.title}" (seller ${c.sellerId})`);
    console.log(`  keep: ${c.keep}`);
    for (const id of c.drop) console.log(`  drop: ${id}`);
  }

  if (!uniqDelete.length) {
    console.log("\nNo duplicate listings to remove.");
    return;
  }

  if (!APPLY) {
    console.log("\nDry-run only. Re-run with --apply and CONFIRM_DUPLICATE_CLEANUP=1 to delete.");
    return;
  }

  if (process.env.CONFIRM_DUPLICATE_CLEANUP !== "1") {
    console.error("\nRefusing delete: set CONFIRM_DUPLICATE_CLEANUP=1");
    process.exit(1);
  }

  let removed = 0;
  for (const row of uniqDelete) {
    if (row._count.orders > 0) {
      console.warn(`skip ${row.id} — has orders`);
      continue;
    }
    await prisma.listing.delete({ where: { id: row.id } });
    console.log(`deleted ${row.id}`);
    removed += 1;
  }

  console.log(`\nDone. Removed ${removed} duplicate listing(s).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
