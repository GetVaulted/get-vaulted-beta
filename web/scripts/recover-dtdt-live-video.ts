/**
 * Emergency: clear Host paused + restart Stage→HLS composition for @dtdt live show.
 * Usage: npx tsx scripts/recover-dtdt-live-video.ts
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
  const { emitStreamStatusChanged } = await import("../src/lib/realtime-emit-server");
  const {
    cancelPausedBroadcastAwsTeardown,
    ensureStageHlsCompositionActive,
  } = await import("../src/services/ivs");

  console.log("db:", redactDatabaseUrl(resolveDatabaseUrl()));
  const prisma = createPostgresPrismaClient(resolveDatabaseUrl());

  try {
    const seller = await prisma.user.findFirst({
      where: { username: { equals: "dtdt", mode: "insensitive" } },
      select: { id: true, username: true },
    });
    if (!seller) {
      console.error("User @dtdt not found");
      process.exit(1);
    }
    console.log("seller:", seller);

    const room = await prisma.liveRoom.findFirst({
      where: { sellerId: seller.id, status: "live" },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        streamMode: true,
        streamHealth: true,
        streamPaused: true,
        roomVersion: true,
        ivsCompositionArn: true,
        ivsStageArn: true,
        ivsChannelArn: true,
        ivsPlaybackUrl: true,
        streamStartedAt: true,
        lastIvsError: true,
        updatedAt: true,
      },
    });

    if (!room) {
      console.error("No LIVE room for @dtdt right now");
      const recent = await prisma.liveRoom.findMany({
        where: { sellerId: seller.id },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: { id: true, title: true, status: true, streamPaused: true, streamHealth: true, updatedAt: true },
      });
      console.log("recent rooms:", recent);
      process.exit(1);
    }

    console.log("before:", JSON.stringify(room, null, 2));

    cancelPausedBroadcastAwsTeardown(room.id);

    const updated = await prisma.liveRoom.update({
      where: { id: room.id },
      data: {
        streamPaused: false,
        roomVersion: { increment: 1 },
      },
      select: {
        id: true,
        streamPaused: true,
        streamHealth: true,
        roomVersion: true,
        ivsCompositionArn: true,
      },
    });

    console.log("cleared streamPaused:", updated);

    emitStreamStatusChanged(room.id, {
      streamHealth: updated.streamHealth,
      streamPaused: false,
      roomVersion: updated.roomVersion,
    });

    console.log("restarting Stage→HLS composition…");
    await ensureStageHlsCompositionActive(room.id);

    const after = await prisma.liveRoom.findUnique({
      where: { id: room.id },
      select: {
        id: true,
        streamPaused: true,
        streamHealth: true,
        ivsCompositionArn: true,
        ivsPlaybackUrl: true,
        roomVersion: true,
        lastIvsError: true,
      },
    });
    console.log("after:", JSON.stringify(after, null, 2));
    console.log("DONE — tell host to tap Play (or Stop→Go Live) if camera is still dark on their phone.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
