/**
 * Diagnose "could not load stream" on the shared web /live/[id] page: recent rooms' stream
 * provider/mode/health + IVS channel/stage fields.
 * Usage: npx tsx scripts/diagnose-live-stream-playback.ts
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

  console.log("db:", redactDatabaseUrl(resolveDatabaseUrl()));

  const prisma = createPostgresPrismaClient(resolveDatabaseUrl());
  try {
    const since = new Date(Date.now() - 3 * 24 * 3600 * 1000);
    const rooms = await prisma.liveRoom.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        id: true,
        title: true,
        roomType: true,
        status: true,
        createdAt: true,
        streamProvider: true,
        streamMode: true,
        streamHealth: true,
        streamPaused: true,
        ivsPlaybackUrl: true,
        ivsIngestEndpoint: true,
        ivsChannelArn: true,
        ivsStageArn: true,
        streamStartedAt: true,
        streamEndedAt: true,
        lastIvsStatusSyncAt: true,
        lastIvsError: true,
      },
    });
    for (const r of rooms) {
      console.log("---");
      console.log(JSON.stringify(r, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
