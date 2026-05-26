import { syncedWallTimeMs } from "@/lib/server-clock-sync";

export function computeAuctionRemainingMs(
  auctionEndsAt: string | null | undefined,
  clockSkewMs: number,
): number | null {
  if (!auctionEndsAt) return null;
  const endsMs = Date.parse(auctionEndsAt);
  if (!Number.isFinite(endsMs)) return null;
  return Math.max(0, endsMs - syncedWallTimeMs(clockSkewMs));
}

export function logAuctionTimer(args: {
  source: string;
  serverNowMs?: number;
  localNowMs?: number;
  offsetMs?: number;
  auctionEndsAt?: string | null;
  remainingMs?: number | null;
  auctionSeq?: number;
  lotBidPhase?: string;
}): void {
  console.info("[auction timer]", {
    serverNowMs: args.serverNowMs,
    localNowMs: args.localNowMs ?? Date.now(),
    offsetMs: args.offsetMs,
    auctionEndsAt: args.auctionEndsAt ?? null,
    remainingMs: args.remainingMs,
    auctionSeq: args.auctionSeq,
    lotBidPhase: args.lotBidPhase,
    source: args.source,
  });
}
