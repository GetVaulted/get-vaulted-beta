/**
 * Public seller profile data shared by the web page (`/seller/[username]`) and the app's
 * `/api/sellers/shop` response: live-show states and the trust summary.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import type { SellerLevel } from "@/generated/prisma/enums";
import { SELLER_LEVEL_DESCRIPTIONS, sellerLevelLabel } from "@/services/payout/seller-level";

export type ProfileShow = {
  id: string;
  title: string;
  category: string;
  status: "live" | "scheduled" | "ended";
  thumbnailUrl: string | null;
  scheduledStartAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
};

export type ProfileShows = {
  liveNow: ProfileShow | null;
  nextShow: ProfileShow | null;
  /** Most recent finished show (null while the seller has never gone live). */
  lastLive: ProfileShow | null;
  /** Most recent finished shows, newest first (includes `lastLive`). */
  recent: ProfileShow[];
  /** Finished shows that actually went live. */
  totalShows: number;
};

type ShowRow = {
  id: string;
  title: string;
  category: string;
  status: "live" | "scheduled" | "ended";
  thumbnailUrl: string;
  scheduledStartAt: Date | null;
  startedAt: Date | null;
  endedAt: Date | null;
};

export const PROFILE_RECENT_SHOWS = 5;

function toShow(r: ShowRow): ProfileShow {
  return {
    id: r.id,
    title: r.title,
    category: r.category,
    status: r.status,
    thumbnailUrl: r.thumbnailUrl?.trim() ? r.thumbnailUrl.trim() : null,
    scheduledStartAt: r.scheduledStartAt?.toISOString() ?? null,
    startedAt: r.startedAt?.toISOString() ?? null,
    endedAt: r.endedAt?.toISOString() ?? null,
  };
}

/** Pure shaping step (unit-tested): picks the live / next / last-live slots from fetched rows. */
export function shapeProfileShows(args: {
  live: ShowRow[];
  scheduled: ShowRow[];
  ended: ShowRow[];
  totalShows: number;
}): ProfileShows {
  const recent = args.ended.slice(0, PROFILE_RECENT_SHOWS).map(toShow);
  return {
    liveNow: args.live[0] ? toShow(args.live[0]) : null,
    nextShow: args.scheduled[0] ? toShow(args.scheduled[0]) : null,
    lastLive: recent[0] ?? null,
    recent,
    totalShows: args.totalShows,
  };
}

/** Shows a visitor may see: public discovery only, never auto-cancelled no-shows. */
export async function loadProfileShows(
  db: Pick<PrismaClient, "liveRoom">,
  sellerId: string,
  now: Date = new Date(),
): Promise<ProfileShows> {
  const base = { sellerId, discoveryVisibility: "public" as const, autoCancelledAt: null };
  const select = {
    id: true,
    title: true,
    category: true,
    status: true,
    thumbnailUrl: true,
    scheduledStartAt: true,
    startedAt: true,
    endedAt: true,
  } as const;
  const endedWhere = { ...base, status: "ended" as const, startedAt: { not: null } };
  const [live, scheduled, ended, totalShows] = await Promise.all([
    db.liveRoom.findMany({
      where: { ...base, status: "live" },
      orderBy: { startedAt: "desc" },
      take: 1,
      select,
    }),
    db.liveRoom.findMany({
      where: { ...base, status: "scheduled", scheduledStartAt: { gte: now } },
      orderBy: { scheduledStartAt: "asc" },
      take: 1,
      select,
    }),
    db.liveRoom.findMany({
      where: endedWhere,
      orderBy: { endedAt: "desc" },
      take: PROFILE_RECENT_SHOWS,
      select,
    }),
    db.liveRoom.count({ where: endedWhere }),
  ]);
  return shapeProfileShows({ live, scheduled, ended, totalShows });
}

/** Followers who still have an active account (deleted or suspended accounts don't count). */
export function sellerFollowerWhere(sellerId: string) {
  return {
    sellerId,
    follower: { accountDeletedAt: null, suspendedAt: null },
  } as const;
}

/**
 * "Sales" on a profile = items sold on Get Vaulted: paid standalone orders (a paid order that only
 * bundles live-spot purchases for shipping is not counted again) plus paid live-spot purchases
 * settled on the platform (spots the seller marked paid off-platform are not Get Vaulted sales).
 */
export async function loadSellerSalesCount(
  db: Pick<PrismaClient, "$queryRaw">,
  sellerId: string,
): Promise<number> {
  const rows = await db.$queryRaw<{ count: bigint | number }[]>`
    select (
      (select count(*) from "Order" o
        where o."sellerId" = ${sellerId}
          and o."paymentStatus" = 'paid'
          and not exists (
            select 1 from "LiveItemVariantPurchase" p where p."fulfillmentOrderId" = o.id
          ))
      +
      (select count(*) from "LiveItemVariantPurchase" p
        join "LiveRoom" r on r.id = p."liveRoomId"
        where r."sellerId" = ${sellerId}
          and p."paymentStatus" = 'paid'
          and p."settlementChannel" is distinct from 'off_platform')
    ) as count`;
  return Number(rows[0]?.count ?? 0);
}

export type ProfileTrust = {
  sellerLevel: SellerLevel;
  sellerLevelLabel: string;
  sellerLevelDescription: string;
  ordersCompleted: number;
  memberSince: string;
  emailVerified: boolean;
};

export function buildProfileTrust(args: {
  sellerLevel: SellerLevel;
  ordersCompleted: number;
  createdAt: Date;
  emailVerified: Date | null;
}): ProfileTrust {
  return {
    sellerLevel: args.sellerLevel,
    sellerLevelLabel: sellerLevelLabel(args.sellerLevel),
    sellerLevelDescription: SELLER_LEVEL_DESCRIPTIONS[args.sellerLevel],
    ordersCompleted: args.ordersCompleted,
    memberSince: args.createdAt.toISOString(),
    emailVerified: args.emailVerified != null,
  };
}
