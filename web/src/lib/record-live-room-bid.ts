import type { Prisma } from "@/generated/prisma/client";

/** Persists an accepted host-lot bid with server `acceptedAt` (Postgres transaction time). */
export async function recordLiveRoomBid(
  tx: Prisma.TransactionClient,
  args: {
    liveRoomId: string;
    liveRoomItemId: string;
    bidderId: string;
    amountUsd: number;
    auctionEventSeq: number;
    acceptedAt: Date;
    idempotencyKey?: string;
  },
): Promise<void> {
  await tx.liveRoomBid.create({
    data: {
      liveRoomId: args.liveRoomId,
      liveRoomItemId: args.liveRoomItemId,
      bidderId: args.bidderId,
      amountUsd: args.amountUsd,
      auctionEventSeq: args.auctionEventSeq,
      acceptedAt: args.acceptedAt,
      idempotencyKey: args.idempotencyKey?.trim() || null,
    },
  });
}
