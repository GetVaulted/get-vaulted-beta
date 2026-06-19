import { NextResponse } from "next/server";
import type { LiveRoomType, Prisma, TeamBoardLeague } from "@/generated/prisma/client";
import { getServerSessionSafe } from "@/lib/auth";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";
import { isDevTempNoDatabaseMode } from "@/lib/dev-temp-no-db";
import { isHiddenFixtureSellerEmail, prismaSellerVisibleOnPublicMarketplace } from "@/lib/demo-seed-sellers";
import { prismaLiveRoomCreateHint, serializePrismaClientError } from "@/lib/prisma-client-error-serialize";
import { prisma } from "@/lib/prisma";
import { parseTeamBoardLeague } from "@/lib/team-board-sets";
import { emitLiveDiscoveryChanged } from "@/lib/realtime-emit-server";
import { buildLiveTipRoomData } from "@/lib/live-tip-moderator";
import {
  resolveLiveRoomMediaUrl,
  resolveLiveRoomPreviewImage,
} from "@/lib/live-room-preview-image";
import { getSellerLiveReadiness } from "@/services/seller/live-show-readiness";
import {
  resolveDefaultProfileForLiveShow,
  seedPlatformShippingProfiles,
} from "@/services/shipping/platform-shipping-profiles";
import { isPublicDiscoveryLiveRoom } from "@/lib/live-room-public-discovery";

const ROOM_TYPES: LiveRoomType[] = ["auction", "sale", "break"];

function parseLimit(v: string | null): number {
  const n = v ? Number(v) : 80;
  if (!Number.isFinite(n)) return 80;
  return Math.min(120, Math.max(1, Math.floor(n)));
}

export async function GET(req: Request) {
  if (isDevTempNoDatabaseMode()) {
    return NextResponse.json({ rooms: [] });
  }

  try {
    const { searchParams } = new URL(req.url);
    const session = await getServerSessionSafe();
    const listingId = (searchParams.get("listingId") ?? "").trim();
    const sellerIdParam = (searchParams.get("sellerId") ?? "").trim();
    const mine = searchParams.get("mine") === "1";
    const limit = parseLimit(searchParams.get("limit"));
    let includeEnded = searchParams.get("includeEnded") === "1";

    let sellerId = sellerIdParam;
    let bearerUserId: string | null = null;
    if (mine) {
      const auth = await resolveLiveRoomsUserId(req);
      if (auth instanceof NextResponse) return auth;
      bearerUserId = auth.userId;
      sellerId = auth.userId;
      includeEnded = true;
    }
    if (listingId) {
      const listing = await prisma.listing.findUnique({
        where: { id: listingId },
        select: { sellerId: true, seller: { select: { email: true } } },
      });
      if (!listing) {
        return NextResponse.json({ rooms: [] });
      }
      if (isHiddenFixtureSellerEmail(listing.seller.email)) {
        return NextResponse.json({ rooms: [] });
      }
      sellerId = listing.sellerId;
    }

    const ownerListingEnded =
      Boolean(sellerId) && includeEnded && session?.user?.id === sellerId;

    const viewingOwnSellerRooms = Boolean(
      sellerId && (session?.user?.id === sellerId || bearerUserId === sellerId),
    );

    const where: Prisma.LiveRoomWhereInput = {
      ...(sellerId ? { sellerId } : {}),
      ...(ownerListingEnded
        ? {}
        : viewingOwnSellerRooms
          ? { status: { in: ["live", "scheduled"] } }
          : {
              OR: [
                { status: "live" },
                { status: "scheduled", scheduledStartAt: { not: null } },
              ],
            }),
      ...(!viewingOwnSellerRooms
        ? { seller: prismaSellerVisibleOnPublicMarketplace() }
        : {}),
    };

    const rows = await prisma.liveRoom.findMany({
      where,
      include: {
        seller: { select: { username: true, name: true, image: true } },
        tipModerator: { select: { username: true } },
        items: {
          select: {
            id: true,
            title: true,
            status: true,
            imageUrl: true,
            sortOrder: true,
            listing: {
              select: {
                images: { select: { url: true }, orderBy: { sortOrder: "asc" }, take: 1 },
              },
            },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });

    const sorted = [...rows].sort((a, b) => {
      if (a.status === b.status) return 0;
      if (a.status === "live") return -1;
      if (b.status === "live") return 1;
      return 0;
    });

    const visibleRows = viewingOwnSellerRooms
      ? sorted
      : sorted.filter((r) => isPublicDiscoveryLiveRoom(r));

    const rooms = visibleRows.map((r) => {
      const active = r.items.find((i) => i.status === "active");
      let firstItemImageUrl = "";
      for (const item of r.items) {
        const direct = item.imageUrl?.trim();
        if (direct) {
          firstItemImageUrl = direct;
          break;
        }
        const listingImg = item.listing?.images?.[0]?.url?.trim();
        if (listingImg) {
          firstItemImageUrl = listingImg;
          break;
        }
      }
      const previewImageUrl = resolveLiveRoomPreviewImage({
        thumbnailUrl: r.thumbnailUrl,
        firstItemImageUrl,
        category: r.category,
      });
      return {
        id: r.id,
        title: r.title,
        description: r.description ?? "",
        category: r.category,
        roomType: r.roomType,
        status: r.status,
        thumbnailUrl: r.thumbnailUrl ?? "",
        previewImageUrl,
        firstItemImageUrl,
        sellerId: r.sellerId,
        sellerAvatarUrl: resolveLiveRoomMediaUrl(r.seller?.image ?? ""),
        sellerDisplayName: r.seller?.name?.trim() || r.seller?.username || "seller",
        viewerCount: r.viewerCount,
        scheduledStartAt: r.scheduledStartAt?.toISOString() ?? null,
        startedAt: r.startedAt?.toISOString() ?? null,
        endedAt: r.endedAt?.toISOString() ?? null,
        sellerUsername: r.seller?.username ?? "seller",
        itemCount: r.items.length,
        activeItemTitle: active?.title ?? null,
        teamBoardLeague: r.teamBoardLeague,
        tipRecipientMode: r.tipRecipientMode,
        tipModeratorId: r.tipModeratorId,
        tipModeratorUsername: r.tipModerator?.username ?? null,
        tipsToModerator: r.tipRecipientMode === "moderator" && Boolean(r.tipModeratorId),
      };
    });

    return NextResponse.json(
      { rooms },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (e) {
    const prismaDto = serializePrismaClientError(e);
    console.error("[api GET /api/live-rooms] list failed", { prisma: prismaDto, raw: e });
    return NextResponse.json(
      {
        error: "Could not load live rooms.",
        code: "LIVE_ROOMS_LIST_FAILED",
        detail: prismaDto.message,
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

type PostBody = {
  title?: string;
  description?: string;
  category?: string;
  roomType?: string;
  thumbnailUrl?: string;
  scheduledStartAt?: string | null;
  /** Required when roomType is `break`: nfl | nba | mlb */
  teamBoardLeague?: string;
  /** Break: number of spots (e.g. 30). */
  breakTotalSpots?: number | null;
  /** Break: `fixed` or `auction` spot pricing intent. */
  breakPricingMode?: string;
  /** Break: spot price when `breakPricingMode` is `fixed`. */
  breakSpotPriceUsd?: number | null;
  /** Break: when false, team board starts hidden for the stream. Default true. */
  teamSelectionBoardEnabled?: boolean;
  tipModeratorId?: string | null;
  tipRecipientMode?: string;
  tipsToModerator?: boolean;
  defaultShippingProfileId?: string | null;
  shippingCapEnabled?: boolean;
  shippingCapCents?: number | null;
  freeShippingEnabled?: boolean;
  sellerPaysOverCap?: boolean;
};

function peekBearerJwtSub(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const jwt = auth.slice("Bearer ".length).trim();
  const part = jwt.split(".")[1];
  if (!part) return null;
  try {
    const json = JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as {
      sub?: string;
    };
    return typeof json.sub === "string" ? json.sub : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const jwtSub = peekBearerJwtSub(req);
  const auth = await resolveLiveRoomsUserId(req);
  if (auth instanceof NextResponse) {
    let body: { error?: string; code?: string } = {};
    try {
      body = (await auth.clone().json()) as typeof body;
    } catch {
      /* ignore */
    }
    console.warn("[api POST /api/live-rooms] auth rejected", {
      status: auth.status,
      jwtSub,
      code: body.code ?? null,
      error: body.error ?? null,
    });
    return auth;
  }
  const sellerId = auth.userId;

  const readiness = await getSellerLiveReadiness(sellerId);
  if (!readiness.canGoLive) {
    const issues = readiness.issues.filter((i) => i.trim().length > 0);
    console.warn("[api POST /api/live-rooms] live not ready", {
      sellerId,
      userId: sellerId,
      jwtSub,
      jwtSellerMismatch: Boolean(jwtSub && jwtSub !== sellerId),
      issues,
      checks: readiness.checks,
    });
    return NextResponse.json(
      {
        error: issues[0] ?? "Complete seller setup before creating a live room.",
        code: "LIVE_NOT_READY",
        issues,
        sellerUserId: sellerId,
      },
      { status: 403 },
    );
  }

  console.info("[api POST /api/live-rooms] authorized", {
    sellerId,
    userId: sellerId,
    jwtSub,
    jwtSellerMismatch: Boolean(jwtSub && jwtSub !== sellerId),
    canGoLive: true,
  });

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });

  const roomType = typeof body.roomType === "string" ? body.roomType.trim() : "";
  if (!ROOM_TYPES.includes(roomType as LiveRoomType)) {
    return NextResponse.json({ error: "Invalid roomType." }, { status: 400 });
  }

  const description = typeof body.description === "string" ? body.description.trim().slice(0, 4000) : "";
  const category = typeof body.category === "string" ? body.category.trim().slice(0, 64) : "Other";
  const thumbnailUrl = typeof body.thumbnailUrl === "string" ? body.thumbnailUrl.trim().slice(0, 50000) : "";

  let scheduledStartAt: Date | null = null;
  if (body.scheduledStartAt) {
    const d = new Date(body.scheduledStartAt);
    if (!Number.isNaN(d.getTime())) scheduledStartAt = d;
  }

  const rt = roomType as LiveRoomType;
  let teamBoardLeague: TeamBoardLeague = "nba";
  let breakTotalSpots: number | undefined;
  let breakSpotPriceUsd: number | null | undefined;
  if (rt === "break") {
    const rawLg = typeof body.teamBoardLeague === "string" ? body.teamBoardLeague.trim() : "";
    const p = parseTeamBoardLeague(rawLg);
    if (!p) {
      return NextResponse.json(
        { error: "Break rooms require teamBoardLeague (nfl, nba, or mlb)." },
        { status: 400 },
      );
    }
    teamBoardLeague = p;

    const spotsRaw = body.breakTotalSpots;
    if (spotsRaw != null) {
      const n = typeof spotsRaw === "number" ? spotsRaw : Number(spotsRaw);
      if (Number.isFinite(n) && n >= 1 && n <= 512) {
        breakTotalSpots = Math.floor(n);
      }
    }

    const mode = typeof body.breakPricingMode === "string" ? body.breakPricingMode.trim().toLowerCase() : "fixed";
    if (mode === "auction") {
      breakSpotPriceUsd = null;
    } else {
      const pr = body.breakSpotPriceUsd;
      const px = typeof pr === "number" && Number.isFinite(pr) ? pr : pr != null ? Number(pr) : NaN;
      breakSpotPriceUsd = Number.isFinite(px) && px > 0 ? px : null;
    }
  }

  const teamSelectionBoardEnabled = body.teamSelectionBoardEnabled !== false;

  await seedPlatformShippingProfiles().catch(() => {
    /* profiles table may not exist until migration runs */
  });

  const defaultProfile = await resolveDefaultProfileForLiveShow({
    showDefaultProfileId:
      typeof body.defaultShippingProfileId === "string" ? body.defaultShippingProfileId.trim() : null,
    category,
  });

  const shippingCapEnabled = body.shippingCapEnabled === true;
  const shippingCapRaw = body.shippingCapCents;
  const shippingCapCents =
    shippingCapRaw != null && Number.isFinite(Number(shippingCapRaw))
      ? Math.max(0, Math.floor(Number(shippingCapRaw)))
      : null;
  const freeShippingEnabled = body.freeShippingEnabled === true;
  const sellerPaysOverCap = body.sellerPaysOverCap !== false;

  const tipBuilt = await buildLiveTipRoomData(sellerId, body);
  if (!tipBuilt.ok) {
    return NextResponse.json({ error: tipBuilt.error }, { status: 400 });
  }

  if (isDevTempNoDatabaseMode()) {
    return NextResponse.json(
      {
        error:
          "Live room creation needs Postgres. Remove GV_DEV_TEMP_NO_DB from .env.local (or set it to anything other than 1) and ensure DATABASE_URL is valid.",
        code: "NO_DATABASE",
      },
      { status: 503 },
    );
  }

  const createDebug = process.env.LIVE_CREATE_DEBUG === "1";
  const logCreate = (msg: string, extra?: Record<string, unknown>) => {
    if (createDebug) console.info("[api POST /api/live-rooms]", msg, { sellerId, roomType: rt, ...extra });
  };

  const roomData = {
    sellerId,
    title: title.slice(0, 200),
    description,
    category: category || "Other",
    roomType: rt,
    status: "scheduled" as const,
    thumbnailUrl,
    scheduledStartAt,
    teamBoardLeague,
    tipModeratorId: tipBuilt.data.tipModeratorId,
    tipRecipientMode: tipBuilt.data.tipRecipientMode,
    defaultShippingProfileId: defaultProfile?.id ?? null,
    shippingCapEnabled,
    shippingCapCents: shippingCapEnabled ? shippingCapCents : null,
    freeShippingEnabled,
    sellerPaysOverCap,
    ...(rt === "break"
      ? {
          ...(breakTotalSpots != null ? { breakTotalSpots } : {}),
          breakSpotPriceUsd: breakSpotPriceUsd ?? null,
        }
      : {}),
  };

  const createPayloadForLog = {
    sellerId: roomData.sellerId,
    roomType: roomData.roomType,
    titleLen: roomData.title.length,
    category: roomData.category,
    descriptionLen: roomData.description.length,
    thumbnailUrlLen: roomData.thumbnailUrl.length,
    hasScheduledStartAt: Boolean(roomData.scheduledStartAt),
    teamBoardLeague: roomData.teamBoardLeague,
    ...(rt === "break"
      ? {
          breakTotalSpots: "breakTotalSpots" in roomData ? (roomData as { breakTotalSpots?: number }).breakTotalSpots : undefined,
          breakSpotPriceUsd: "breakSpotPriceUsd" in roomData ? (roomData as { breakSpotPriceUsd?: number | null }).breakSpotPriceUsd : undefined,
        }
      : {}),
  };

  const sellerRow = await prisma.user.findUnique({
    where: { id: sellerId },
    select: { id: true, email: true },
  });
  if (!sellerRow) {
    console.warn("[api POST /api/live-rooms] seller user missing in database (preflight)", {
      sessionUserId: sellerId,
      createPayloadForLog,
    });
    logCreate("seller_user_missing_preflight", { sessionUserId: sellerId, createPayloadForLog });
    return NextResponse.json(
      {
        error:
          "Your account exists in the session but not in this database. Sign out and back in, or use the correct DATABASE_URL.",
        code: "SELLER_USER_MISSING_IN_DB",
      },
      { status: 400 },
    );
  }
  logCreate("preflight_ok", { sellerUserId: sellerRow.id, sellerEmailDomain: sellerRow.email?.split("@")[1] ?? null });

  try {
    if (rt === "break") {
      const created = await prisma.$transaction(async (tx) => {
        const r = await tx.liveRoom.create({
          data: roomData,
          select: { id: true },
        });
        await tx.liveRoomTeamBoard.create({
          data: {
            liveRoomId: r.id,
            league: teamBoardLeague,
            visible: teamSelectionBoardEnabled,
          },
        });
        return r;
      });
      logCreate("created_break", { id: created.id });
      emitLiveDiscoveryChanged({ roomId: created.id, status: "scheduled", reason: "created" });
      return NextResponse.json({ id: created.id });
    }

    const room = await prisma.liveRoom.create({
      data: roomData,
      select: { id: true },
    });
    logCreate("created", { id: room.id });
    emitLiveDiscoveryChanged({ roomId: room.id, status: "scheduled", reason: "created" });
    return NextResponse.json({ id: room.id });
  } catch (e) {
    const prismaDto = serializePrismaClientError(e);
    const hint = prismaLiveRoomCreateHint(prismaDto);
    console.error("[api POST /api/live-rooms] create failed", {
      prisma: prismaDto,
      createPayloadForLog,
      raw: e,
    });
    logCreate("create_failed", { prisma: prismaDto, createPayloadForLog, hint });
    return NextResponse.json(
      {
        error: "Could not create live room in the database. See prisma details below.",
        prisma: prismaDto,
        hint,
        /** Full message for clients that do not read `prisma.message` separately */
        detail: prismaDto.message,
      },
      { status: 500 },
    );
  }
}
