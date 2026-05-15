import Link from "next/link";
import { redirect } from "next/navigation";
import { BreakHostConsole } from "@/components/break-host/BreakHostConsole";
import { getServerSessionSafe } from "@/lib/auth";
import { logLiveLoaderDebug, safeDecodeRouteSegment } from "@/lib/live-loader-debug";
import { prisma } from "@/lib/prisma";

export default async function BreakHostConsolePage({ params }: { params: Promise<{ roomId: string }> }) {
  const session = await getServerSessionSafe();
  const { roomId: raw } = await params;
  const roomId = safeDecodeRouteSegment(raw ?? "");

  if (!session?.user?.id) {
    redirect(`/signin?returnTo=${encodeURIComponent(`/seller/live/${encodeURIComponent(roomId)}/console`)}`);
  }

  const room = await prisma.liveRoom.findUnique({
    where: { id: roomId },
    select: { sellerId: true, roomType: true },
  });
  if (!room) {
    logLiveLoaderDebug("seller_console_room_missing", {
      path: "/seller/live/[roomId]/console",
      roomIdParamRaw: raw,
      roomIdDecoded: roomId,
      sessionUserId: session.user.id,
    });
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="font-display text-xl font-bold text-white">Host console — room not found</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          There is no live room with this id in the database. The link may be stale, the room was deleted, or the URL may
          not match your current environment (check <code className="text-zinc-300">DATABASE_URL</code>).
        </p>
        <p className="mt-2 text-xs text-zinc-600">
          Set <code className="text-zinc-400">LIVE_CONSOLE_LOADER_DEBUG=1</code> for server logs on this branch.
        </p>
        <Link href="/seller/live" className="mt-8 inline-block text-sm font-semibold text-gold-bright hover:underline">
          ← Back to Seller Live
        </Link>
      </div>
    );
  }
  if (room.roomType !== "break") {
    logLiveLoaderDebug("seller_console_wrong_room_type", {
      roomId,
      roomType: room.roomType,
      sessionUserId: session.user.id,
    });
    redirect("/seller/live");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, suspendedAt: true },
  });
  if (user?.suspendedAt || (room.sellerId !== session.user.id && user?.role !== "admin")) {
    logLiveLoaderDebug("seller_console_forbidden", {
      roomId,
      sessionUserId: session.user.id,
      roomSellerId: room.sellerId,
      isAdmin: user?.role === "admin",
      suspended: Boolean(user?.suspendedAt),
    });
    redirect("/");
  }

  return <BreakHostConsole roomId={roomId} />;
}
