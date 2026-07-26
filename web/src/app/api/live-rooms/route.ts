import { NextResponse } from "next/server";
import type { LiveRoomType, Prisma, TeamBoardLeague } from "@/generated/prisma/client";
import type { LiveShowCarrierPreference } from "@/generated/prisma/enums";
import { getServerSessionSafe } from "@/lib/auth";
import { resolveLiveRoomsUserId, resolveOptionalLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";
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
  DEFAULT_LIVE_SHOW_SHIPPING_CAP_CENTS,
  liveRoomShippingPatchFromMode,
  resolveLiveShowShippingCapCents,
} from "@/lib/live-show-shipping-terms";
import { seedSellerShippingProfiles } from "@/services/shipping/seller-shipping-profiles";
import { resolveSellerShippingProfileIdForCategory } from "@/lib/live-show-category-shipping-profile";
import {
  resolveDefaultProfileForLiveShow,
  seedPlatformShippingProfiles,
} from "@/services/shipping/platform-shipping-profiles";
import { isPublicDiscoveryLiveRoom, parseLiveRoomDiscoveryVisibility } from "@/lib/live-room-public-discovery";
import { buildWeeklyRecurringScheduleDates } from "@/lib/live-room-recurring-schedule";
import { parseLiveTeaserFieldsFromBody } from "@/lib/live-room-teaser";
import { listHiddenPeerIdsForViewer } from "@/lib/user-block";
import { scheduleNotifyAdminsLiveShowCreated } from "@/lib/live-show-created-admin-notify";

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
      Boolean(sellerId) &&
      includeEnded &&
      (session?.user?.id === sellerId || bearerUserId === sellerId);

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
              status: { in: ["live", "scheduled"] },
            }),
      ...(!viewingOwnSellerRooms
        ? {
            seller: prismaSellerVisibleOnPublicMarketplace(),
            id: { not: { startsWith: "shot_lr_" } },
            discoveryVisibility: "public",
          }
        : {}),
    };

    const viewerId =
      bearerUserId ??
      session?.user?.id ??
      (await resolveOptionalLiveRoomsUserId(req));
    if (viewerId && !viewingOwnSellerRooms) {
      const hiddenHosts = await listHiddenPeerIdsForViewer(prisma, viewerId);
      if (hiddenHosts.length > 0) {
        if (sellerId && hiddenHosts.includes(sellerId)) {
          return NextResponse.json({ rooms: [] });
        }
        if (!sellerId) {
          where.sellerId = { notIn: hiddenHosts };
        }
      }
    }

    const rows = await prisma.liveRoom.findMany({
      where,
      include: {
        seller: { select: { username: true, image: true } },
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

    // Seller HQ (includeEnded): live → scheduled → ended.
    // Discovery (no ended): live first, then scheduled soonest-first.
    // Bugfix: ended rooms used to sort by scheduledStartAt ASC with scheduled rooms, so dozens of
    // old ended shows buried brand-new scheduled rooms past the top-of-list slice.
    const sorted = [...rows].sort((a, b) => {
      const rank = (status: string) => {
        if (status === "live") return 0;
        if (status === "scheduled") return 1;
        return 2; // ended / other
      };
      const ra = rank(a.status);
      const rb = rank(b.status);
      if (ra !== rb) return ra - rb;

      if (ra === 0) {
        const viewerDelta = (b.viewerCount ?? 0) - (a.viewerCount ?? 0);
        if (viewerDelta !== 0) return viewerDelta;
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      }

      if (ra === 1) {
        const aStart = a.scheduledStartAt?.getTime() ?? Number.POSITIVE_INFINITY;
        const bStart = b.scheduledStartAt?.getTime() ?? Number.POSITIVE_INFINITY;
        const aMs = Number.isFinite(aStart) ? aStart : Number.POSITIVE_INFINITY;
        const bMs = Number.isFinite(bStart) ? bStart : Number.POSITIVE_INFINITY;
        if (aMs !== bMs) return aMs - bMs;
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      }

      // Ended: most recently updated first so the list isn't dominated by ancient shows.
      return b.updatedAt.getTime() - a.updatedAt.getTime();
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
        teaserVideoUrl: r.teaserVideoUrl?.trim() || null,
        teaserVideoDurationMs:
          typeof r.teaserVideoDurationMs === "number" && Number.isFinite(r.teaserVideoDurationMs)
            ? Math.round(r.teaserVideoDurationMs)
            : null,
        previewImageUrl,
        firstItemImageUrl,
        sellerId: r.sellerId,
        sellerAvatarUrl: resolveLiveRoomMediaUrl(r.seller?.image ?? ""),
        // Public show cards must use username only — never legal/full name from User.name.
        sellerDisplayName: r.seller?.username?.trim() || "seller",
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
        discoveryVisibility: r.discoveryVisibility,
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
  teaserVideoUrl?: string | null;
  teaserVideoDurationMs?: number | null;
  scheduledStartAt?: string | null;
  /** Required when roomType is `break`: nfl | nba | mlb */
  teamBoardLeague?: string;
  /** Break: number of spots (e.g. 30). */
  breakTotalSpots?: number | null;
  /** Break: `fixed`, `auction`, or `hybrid` spot pricing intent. */
  breakPricingMode?: string;
  /** Break: spot price when `breakPricingMode` is `fixed`. */
  breakSpotPriceUsd?: number | null;
  /** Break: when false, team board starts hidden for the stream. Default true. */
  teamSelectionBoardEnabled?: boolean;
  tipModeratorId?: string | null;
  tipRecipientMode?: string;
  tipsToModerator?: boolean;
  defaultShippingProfileId?: string | null;
  defaultSellerShippingProfileId?: string | null;
  shippingMode?: "calculated" | "capped" | "free";
  carrierPreference?: "usps" | "ups" | "best_rate";
  bundleEligiblePurchases?: boolean;
  shippingCapEnabled?: boolean;
  shippingCapCents?: number | null;
  freeShippingEnabled?: boolean;
  sellerPaysOverCap?: boolean;
  /** When true with scheduledStartAt, creates weekly shows through 30 days. */
  recurringEnabled?: boolean;
  /** `public` (default) lists on Live Shows; `private` is link-only. */
  discoveryVisibility?: string;
  visibility?: string;
  isPrivate?: boolean;
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
  const teaserParsed = parseLiveTeaserFieldsFromBody(body);
  if (!teaserParsed.ok) {
    return NextResponse.json({ error: teaserParsed.error }, { status: 400 });
  }

  let scheduledStartAt: Date | null = null;
  if (body.scheduledStartAt) {
    const d = new Date(body.scheduledStartAt);
    if (!Number.isNaN(d.getTime())) scheduledStartAt = d;
  }
  // "Go live now" events omit a schedule — anchor them in discovery/upcoming lists immediately.
  if (!scheduledStartAt) {
    scheduledStartAt = new Date();
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
    } else if (mode === "fixed" || mode === "hybrid") {
      const pr = body.breakSpotPriceUsd;
      const px = typeof pr === "number" && Number.isFinite(pr) ? pr : pr != null ? Number(pr) : NaN;
      breakSpotPriceUsd = Number.isFinite(px) && px > 0 ? px : null;
    } else {
      breakSpotPriceUsd = null;
    }
  }

  const teamSelectionBoardEnabled = body.teamSelectionBoardEnabled !== false;

  await seedPlatformShippingProfiles().catch(() => {
    /* profiles table may not exist until migration runs */
  });
  await seedSellerShippingProfiles(sellerId).catch(() => {});

  const defaultSellerProfiles = await prisma.sellerShippingProfile.findMany({
    where: { sellerId, archivedAt: null },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });

  const defaultSellerProfileId =
    typeof body.defaultSellerShippingProfileId === "string" && body.defaultSellerShippingProfileId.trim()
      ? body.defaultSellerShippingProfileId.trim()
      : resolveSellerShippingProfileIdForCategory(defaultSellerProfiles, category) ||
        defaultSellerProfiles.find((p) => p.isDefault)?.id ||
        defaultSellerProfiles[0]?.id ||
        null;

  const defaultProfile = await resolveDefaultProfileForLiveShow({
    showDefaultProfileId:
      typeof body.defaultShippingProfileId === "string" ? body.defaultShippingProfileId.trim() : null,
    category,
  });

  const shippingModeRaw = typeof body.shippingMode === "string" ? body.shippingMode.trim().toLowerCase() : "";
  const shippingMode =
    shippingModeRaw === "calculated" || shippingModeRaw === "capped" || shippingModeRaw === "free"
      ? shippingModeRaw
      : body.freeShippingEnabled === true
        ? "free"
        : body.shippingCapEnabled === false && body.shippingCapEnabled !== undefined
          ? "calculated"
          : "capped";

  const modePatch = liveRoomShippingPatchFromMode({
    shippingMode,
    shippingCapCents:
      body.shippingCapCents != null && Number.isFinite(Number(body.shippingCapCents))
        ? Math.max(0, Math.floor(Number(body.shippingCapCents)))
        : DEFAULT_LIVE_SHOW_SHIPPING_CAP_CENTS,
  });

  const carrierRaw = typeof body.carrierPreference === "string" ? body.carrierPreference.trim().toLowerCase() : "";
  const carrierPreference: LiveShowCarrierPreference =
    carrierRaw === "usps" || carrierRaw === "ups" || carrierRaw === "best_rate" ? carrierRaw : "best_rate";
  const bundleEligiblePurchases = body.bundleEligiblePurchases !== false;
  const sellerPaysOverCap = body.sellerPaysOverCap !== false;
  const discoveryVisibility = parseLiveRoomDiscoveryVisibility(body);

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
    discoveryVisibility,
    thumbnailUrl,
    teaserVideoUrl: teaserParsed.data.teaserVideoUrl ?? null,
    teaserVideoDurationMs: teaserParsed.data.teaserVideoDurationMs ?? null,
    scheduledStartAt,
    teamBoardLeague,
    tipModeratorId: tipBuilt.data.tipModeratorId,
    tipRecipientMode: tipBuilt.data.tipRecipientMode,
    defaultShippingProfileId: defaultProfile?.id ?? null,
    defaultSellerShippingProfileId: defaultSellerProfileId,
    shippingMode: modePatch.shippingMode,
    carrierPreference,
    bundleEligiblePurchases,
    shippingCapEnabled: modePatch.shippingCapEnabled,
    shippingCapCents: modePatch.shippingCapCents,
    freeShippingEnabled: modePatch.freeShippingEnabled,
    sellerPaysOverCap,
    shippingTermsVersion: 1,
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

  const recurringEnabled = body.recurringEnabled === true;

  if (recurringEnabled && !scheduledStartAt) {
    return NextResponse.json(
      { error: "Recurring shows require a scheduled start date and time.", code: "RECURRING_REQUIRES_SCHEDULE" },
      { status: 400 },
    );
  }

  const liveShowCount = await prisma.liveRoom.count({
    where: { sellerId, status: "live" },
  });
  if (liveShowCount >= 1) {
    return NextResponse.json(
      {
        error: "You already have a live show running. End it before starting another.",
        code: "LIVE_ROOM_LIMIT",
      },
      { status: 409 },
    );
  }

  if (!recurringEnabled) {
    const recentDuplicate = await prisma.liveRoom.findFirst({
      where: {
        sellerId,
        title: title.slice(0, 200),
        createdAt: { gte: new Date(Date.now() - 120_000) },
      },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });
    if (recentDuplicate) {
      return NextResponse.json({ id: recentDuplicate.id, duplicate: true });
    }
  }

  const scheduleSlots: (Date | null)[] =
    recurringEnabled && scheduledStartAt
      ? buildWeeklyRecurringScheduleDates(scheduledStartAt)
      : [scheduledStartAt];

  if (recurringEnabled && scheduleSlots.length === 0) {
    return NextResponse.json(
      { error: "No recurring dates fall within the next month.", code: "RECURRING_EMPTY" },
      { status: 400 },
    );
  }

  try {
    const createdIds: string[] = [];
    const seller = await prisma.user.findUnique({
      where: { id: sellerId },
      select: { username: true },
    });

    for (const slot of scheduleSlots) {
      const slotRoomData = { ...roomData, scheduledStartAt: slot };

      if (rt === "break") {
        const created = await prisma.$transaction(async (tx) => {
          const r = await tx.liveRoom.create({
            data: slotRoomData,
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
        createdIds.push(created.id);
        emitLiveDiscoveryChanged({ roomId: created.id, status: "scheduled", reason: "created" });
        scheduleNotifyAdminsLiveShowCreated({
          roomId: created.id,
          title: title.slice(0, 200),
          roomType: rt,
          sellerUsername: seller?.username,
          scheduledStartAt: slot,
        });
        logCreate("created_break", { id: created.id, recurring: recurringEnabled });
      } else {
        const room = await prisma.liveRoom.create({
          data: slotRoomData,
          select: { id: true },
        });
        createdIds.push(room.id);
        emitLiveDiscoveryChanged({ roomId: room.id, status: "scheduled", reason: "created" });
        scheduleNotifyAdminsLiveShowCreated({
          roomId: room.id,
          title: title.slice(0, 200),
          roomType: rt,
          sellerUsername: seller?.username,
          scheduledStartAt: slot,
        });
        logCreate("created", { id: room.id, recurring: recurringEnabled });
      }
    }

    return NextResponse.json({
      id: createdIds[0],
      ...(createdIds.length > 1 ? { recurringCount: createdIds.length, recurringIds: createdIds } : {}),
    });
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
