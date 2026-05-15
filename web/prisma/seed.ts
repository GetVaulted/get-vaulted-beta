import "dotenv/config";
import {
  PrismaClient,
  type LiveRoomItemStatus,
  type LiveRoomMessageType,
  type LiveRoomStatus,
  type LiveRoomType,
} from "../src/generated/prisma/client";
import { createPostgresPrismaClient } from "../src/lib/prisma-pg-factory";
import { seedMarketplaceListings } from "./seed-marketplace-fixtures";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run prisma/seed.ts (use your Supabase Postgres URI).");
}
if (!databaseUrl.startsWith("postgres://") && !databaseUrl.startsWith("postgresql://")) {
  throw new Error("DATABASE_URL must be a postgres:// or postgresql:// URI.");
}

const prisma: PrismaClient = createPostgresPrismaClient(databaseUrl);

/** Stable demo live rooms — removed and recreated each seed run for idempotent demo data. */
const SEED_LIVE_ROOM_IDS = [
  "seed_lr_break_live",
  "seed_lr_sale_live",
  "seed_lr_auction_live",
  "seed_lr_auction_sched",
  "seed_lr_sale_sched",
] as const;

const DEMO_VIEWER_EMAIL = "seed+demoviewer@getvaulted.internal";
const DEMO_VIEWER_USERNAME = "DemoViewer";

const listingById = new Map(seedMarketplaceListings.map((l) => [l.id, l]));

function picsum(seed: string, w = 640, h = 360) {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${w}/${h}`;
}

async function seedDemoLiveRooms(sellerIdByUsername: Map<string, string>) {
  const demoViewer = await prisma.user.upsert({
    where: { email: DEMO_VIEWER_EMAIL },
    create: {
      email: DEMO_VIEWER_EMAIL,
      username: DEMO_VIEWER_USERNAME,
      name: "Demo Viewer",
    },
    update: { name: "Demo Viewer" },
  });

  await prisma.liveRoom.deleteMany({
    where: { id: { in: [...SEED_LIVE_ROOM_IDS] } },
  });

  const seller = (username: string) => {
    const id = sellerIdByUsername.get(username);
    if (!id) throw new Error(`Seed: missing seller user for ${username}`);
    return id;
  };

  const li = (listingId: string) => {
    const l = listingById.get(listingId);
    if (!l) throw new Error(`Seed: unknown listing ${listingId}`);
    return l;
  };

  type ItemSeed = {
    id: string;
    listingId: string | null;
    title: string;
    imageUrl: string;
    priceUsd: number | null;
    startingBidUsd: number | null;
    currentBidUsd: number | null;
    status: LiveRoomItemStatus;
    sortOrder: number;
  };

  type MsgSeed = {
    id: string;
    senderKey: "seller" | "viewer";
    body: string;
    messageType: LiveRoomMessageType;
    createdAt: Date;
  };

  type RoomSeed = {
    id: (typeof SEED_LIVE_ROOM_IDS)[number];
    sellerUsername: string;
    title: string;
    description: string;
    category: string;
    roomType: LiveRoomType;
    status: LiveRoomStatus;
    thumbnailUrl: string;
    viewerCount: number;
    scheduledStartAt: Date | null;
    startedAt: Date | null;
    items: ItemSeed[];
    messages: MsgSeed[];
  };

  const startedLive = new Date("2026-05-02T17:30:00.000Z");
  const schedEvening = new Date("2026-06-14T23:00:00.000Z");
  const schedWeekend = new Date("2026-06-15T16:00:00.000Z");

  const rooms: RoomSeed[] = [
    {
      id: "seed_lr_break_live",
      sellerUsername: "CardVaultBreaks",
      title: "National Treasures Basketball PYT — Night Stream",
      description:
        "32-team PYT rolling spots. Hits ship insured. Last break: PSA 10 rookie color — room went wild. Grab a spot before we random the filler.",
      category: "Breaks",
      roomType: "break",
      status: "live",
      thumbnailUrl: picsum("gv-live-break-nt", 1280, 720),
      viewerCount: 1842,
      scheduledStartAt: null,
      startedAt: startedLive,
      items: [
        {
          id: "seed_lri_break_live_0",
          listingId: "m1",
          title: li("m1").title,
          imageUrl: picsum(li("m1").imageSeed, 400, 300),
          priceUsd: li("m1").price,
          startingBidUsd: null,
          currentBidUsd: null,
          status: "sold",
          sortOrder: 0,
        },
        {
          id: "seed_lri_break_live_1",
          listingId: "m11",
          title: li("m11").title,
          imageUrl: picsum(li("m11").imageSeed, 400, 300),
          priceUsd: li("m11").price,
          startingBidUsd: null,
          currentBidUsd: null,
          status: "active",
          sortOrder: 1,
        },
        {
          id: "seed_lri_break_live_2",
          listingId: null,
          title: "Lakers PYT — Spot 14 (pending payment)",
          imageUrl: picsum("gv-pyt-lakers", 400, 300),
          priceUsd: 64,
          startingBidUsd: null,
          currentBidUsd: null,
          status: "queued",
          sortOrder: 2,
        },
        {
          id: "seed_lri_break_live_3",
          listingId: null,
          title: "Celtics PYT — Spot 7",
          imageUrl: picsum("gv-pyt-celtics", 400, 300),
          priceUsd: 52,
          startingBidUsd: null,
          currentBidUsd: null,
          status: "queued",
          sortOrder: 3,
        },
        {
          id: "seed_lri_break_live_4",
          listingId: null,
          title: "Mystery filler — random team",
          imageUrl: picsum("gv-filler-mystery", 400, 300),
          priceUsd: 18,
          startingBidUsd: null,
          currentBidUsd: null,
          status: "queued",
          sortOrder: 4,
        },
      ],
      messages: [
        {
          id: "seed_lrm_break_live_0",
          senderKey: "seller",
          body: "Going live in 30 seconds — mic check. Good luck everyone.",
          messageType: "system",
          createdAt: new Date("2026-05-02T17:29:40.000Z"),
        },
        {
          id: "seed_lrm_break_live_1",
          senderKey: "viewer",
          body: "LFG — been waiting all week for NT night",
          messageType: "chat",
          createdAt: new Date("2026-05-02T17:30:05.000Z"),
        },
        {
          id: "seed_lrm_break_live_2",
          senderKey: "viewer",
          body: "Bid $455 on the Zion spot package",
          messageType: "bid",
          createdAt: new Date("2026-05-02T17:31:12.000Z"),
        },
        {
          id: "seed_lrm_break_live_3",
          senderKey: "viewer",
          body: "DemoViewer secured Lakers PYT for $64",
          messageType: "purchase",
          createdAt: new Date("2026-05-02T17:32:00.000Z"),
        },
        {
          id: "seed_lrm_break_live_4",
          senderKey: "seller",
          body: "Spot 14 marked SOLD — running random for filler next.",
          messageType: "system",
          createdAt: new Date("2026-05-02T17:32:18.000Z"),
        },
      ],
    },
    {
      id: "seed_lr_sale_live",
      sellerUsername: "SoleProof",
      title: "Sneaker vault clearance — DS heat & steals",
      description:
        "Buy-now lots straight from our vault. Authenticity guaranteed. Ask in chat for size checks before you lock a pair.",
      category: "Sneakers",
      roomType: "sale",
      status: "live",
      thumbnailUrl: picsum("gv-live-sale-sneakers", 1280, 720),
      viewerCount: 612,
      scheduledStartAt: null,
      startedAt: new Date("2026-05-02T18:00:00.000Z"),
      items: [
        {
          id: "seed_lri_sale_live_0",
          listingId: "m8",
          title: li("m8").title,
          imageUrl: picsum(li("m8").imageSeed, 400, 300),
          priceUsd: li("m8").price,
          startingBidUsd: null,
          currentBidUsd: null,
          status: "sold",
          sortOrder: 0,
        },
        {
          id: "seed_lri_sale_live_1",
          listingId: "m9",
          title: li("m9").title,
          imageUrl: picsum(li("m9").imageSeed, 400, 300),
          priceUsd: li("m9").price,
          startingBidUsd: null,
          currentBidUsd: null,
          status: "active",
          sortOrder: 1,
        },
        {
          id: "seed_lri_sale_live_2",
          listingId: null,
          title: "Mystery accessory bundle (socks, lace swap, tote)",
          imageUrl: picsum("gv-sale-bundle", 400, 300),
          priceUsd: 39,
          startingBidUsd: null,
          currentBidUsd: null,
          status: "queued",
          sortOrder: 2,
        },
        {
          id: "seed_lri_sale_live_3",
          listingId: null,
          title: "Yeezy 350 v2 — used 9/10 (next up)",
          imageUrl: picsum("gv-sale-yeezy", 400, 300),
          priceUsd: 210,
          startingBidUsd: null,
          currentBidUsd: null,
          status: "queued",
          sortOrder: 3,
        },
      ],
      messages: [
        {
          id: "seed_lrm_sale_live_0",
          senderKey: "seller",
          body: "Sale room is LIVE — first come, first served on posted prices.",
          messageType: "system",
          createdAt: new Date("2026-05-02T17:59:50.000Z"),
        },
        {
          id: "seed_lrm_sale_live_1",
          senderKey: "viewer",
          body: "Does the Chicago pair have OG box?",
          messageType: "chat",
          createdAt: new Date("2026-05-02T18:00:12.000Z"),
        },
        {
          id: "seed_lrm_sale_live_2",
          senderKey: "viewer",
          body: "DemoViewer bought Air Jordan 1 Chicago 2015 for $1680",
          messageType: "purchase",
          createdAt: new Date("2026-05-02T18:04:02.000Z"),
        },
        {
          id: "seed_lrm_sale_live_3",
          senderKey: "viewer",
          body: "I'll take the Panda Dunks at ask if still available",
          messageType: "chat",
          createdAt: new Date("2026-05-02T18:05:30.000Z"),
        },
        {
          id: "seed_lrm_sale_live_4",
          senderKey: "viewer",
          body: "$185 — matching ask on Panda Dunks",
          messageType: "bid",
          createdAt: new Date("2026-05-02T18:06:10.000Z"),
        },
      ],
    },
    {
      id: "seed_lr_auction_live",
      sellerUsername: "SlabCity",
      title: "Sunday slab auction — vintage & modern RCs",
      description:
        "Rapid-fire lots with reserve callouts. Bids are binding — have payment ready. Next lot loads when hammer drops.",
      category: "Trading Cards",
      roomType: "auction",
      status: "live",
      thumbnailUrl: picsum("gv-live-auction-slabs", 1280, 720),
      viewerCount: 956,
      scheduledStartAt: null,
      startedAt: new Date("2026-05-02T16:45:00.000Z"),
      items: [
        {
          id: "seed_lri_auction_live_0",
          listingId: "m2",
          title: li("m2").title,
          imageUrl: picsum(li("m2").imageSeed, 400, 300),
          priceUsd: null,
          startingBidUsd: li("m2").price,
          currentBidUsd: Math.round(li("m2").price * 1.08 * 100) / 100,
          status: "active",
          sortOrder: 0,
        },
        {
          id: "seed_lri_auction_live_1",
          listingId: null,
          title: "1980s wax lot (3 sealed packs) — NO RESERVE",
          imageUrl: picsum("gv-auction-wax", 400, 300),
          priceUsd: null,
          startingBidUsd: 120,
          currentBidUsd: 185,
          status: "queued",
          sortOrder: 1,
        },
        {
          id: "seed_lri_auction_live_2",
          listingId: null,
          title: "Modern chrome rookie lot (10 cards)",
          imageUrl: picsum("gv-auction-chrome-lot", 400, 300),
          priceUsd: null,
          startingBidUsd: 45,
          currentBidUsd: 45,
          status: "queued",
          sortOrder: 2,
        },
        {
          id: "seed_lri_auction_live_3",
          listingId: null,
          title: "Signed ball COA — locker room edition",
          imageUrl: picsum("gv-auction-signed-ball", 400, 300),
          priceUsd: null,
          startingBidUsd: 200,
          currentBidUsd: 200,
          status: "queued",
          sortOrder: 3,
        },
        {
          id: "seed_lri_auction_live_4",
          listingId: null,
          title: "Vintage star lot (VG–EX)",
          imageUrl: picsum("gv-auction-vintage", 400, 300),
          priceUsd: null,
          startingBidUsd: 75,
          currentBidUsd: 110,
          status: "queued",
          sortOrder: 4,
        },
        {
          id: "seed_lri_auction_live_5",
          listingId: null,
          title: "Mystery slab — grade revealed live",
          imageUrl: picsum("gv-auction-mystery-slab", 400, 300),
          priceUsd: null,
          startingBidUsd: 50,
          currentBidUsd: 50,
          status: "queued",
          sortOrder: 5,
        },
      ],
      messages: [
        {
          id: "seed_lrm_auction_live_0",
          senderKey: "seller",
          body: "Reserve met on the Jordan Fleer lot — bidding stays open 45 more seconds.",
          messageType: "system",
          createdAt: new Date("2026-05-02T16:45:10.000Z"),
        },
        {
          id: "seed_lrm_auction_live_1",
          senderKey: "viewer",
          body: "$13,200",
          messageType: "bid",
          createdAt: new Date("2026-05-02T16:46:22.000Z"),
        },
        {
          id: "seed_lrm_auction_live_2",
          senderKey: "viewer",
          body: "That wax lot is flying — love a no reserve room",
          messageType: "chat",
          createdAt: new Date("2026-05-02T16:47:01.000Z"),
        },
        {
          id: "seed_lrm_auction_live_3",
          senderKey: "viewer",
          body: "DemoViewer won Jordan 1986 Fleer #57 at $13,824",
          messageType: "purchase",
          createdAt: new Date("2026-05-02T16:48:00.000Z"),
        },
      ],
    },
    {
      id: "seed_lr_auction_sched",
      sellerUsername: "InkAndLeather",
      title: "Game-used & signed memorabilia auction",
      description:
        "Helmets, jerseys, and authenticated signatures from private collections. Preview lots below; gavel starts at showtime.",
      category: "Memorabilia",
      roomType: "auction",
      status: "scheduled",
      thumbnailUrl: picsum("gv-sched-mem-auction", 1280, 720),
      viewerCount: 38,
      scheduledStartAt: schedEvening,
      startedAt: null,
      items: [
        {
          id: "seed_lri_auction_sched_0",
          listingId: "m4",
          title: li("m4").title,
          imageUrl: picsum(li("m4").imageSeed, 400, 300),
          priceUsd: null,
          startingBidUsd: li("m4").price,
          currentBidUsd: li("m4").price,
          status: "queued",
          sortOrder: 0,
        },
        {
          id: "seed_lri_auction_sched_1",
          listingId: null,
          title: "Signed full-size replica helmet (JSA)",
          imageUrl: picsum("gv-mem-helmet", 400, 300),
          priceUsd: null,
          startingBidUsd: 400,
          currentBidUsd: null,
          status: "queued",
          sortOrder: 1,
        },
        {
          id: "seed_lri_auction_sched_2",
          listingId: null,
          title: "Framed 16×20 photo suite — triple sig",
          imageUrl: picsum("gv-mem-frame", 400, 300),
          priceUsd: null,
          startingBidUsd: 250,
          currentBidUsd: null,
          status: "queued",
          sortOrder: 2,
        },
        {
          id: "seed_lri_auction_sched_3",
          listingId: null,
          title: "Locker nameplate lot (game-issued)",
          imageUrl: picsum("gv-mem-nameplate", 400, 300),
          priceUsd: null,
          startingBidUsd: 90,
          currentBidUsd: null,
          status: "queued",
          sortOrder: 3,
        },
      ],
      messages: [
        {
          id: "seed_lrm_auction_sched_0",
          senderKey: "seller",
          body: "Room opens 10 minutes early for lot questions — set a reminder.",
          messageType: "system",
          createdAt: new Date("2026-06-10T12:00:00.000Z"),
        },
        {
          id: "seed_lrm_auction_sched_1",
          senderKey: "viewer",
          body: "Will Brady mini helmet ship double-boxed?",
          messageType: "chat",
          createdAt: new Date("2026-06-10T14:22:00.000Z"),
        },
        {
          id: "seed_lrm_auction_sched_2",
          senderKey: "seller",
          body: "Yes — all helmets go double-walled with insurance included.",
          messageType: "chat",
          createdAt: new Date("2026-06-10T14:24:00.000Z"),
        },
        {
          id: "seed_lrm_auction_sched_3",
          senderKey: "viewer",
          body: "$1,950 on the Brady mini",
          messageType: "bid",
          createdAt: new Date("2026-06-10T15:00:00.000Z"),
        },
        {
          id: "seed_lrm_auction_sched_4",
          senderKey: "seller",
          body: "Preview photos for lot 3 upload tonight — check back before showtime.",
          messageType: "system",
          createdAt: new Date("2026-06-10T16:00:00.000Z"),
        },
      ],
    },
    {
      id: "seed_lr_sale_sched",
      sellerUsername: "CrownTrade",
      title: "Rolex & Tudor buy-now event — summer drop",
      description:
        "Full-set pieces vetted in-house. Prices firm at go-live; watchlist members get first ping when the room opens.",
      category: "Watches",
      roomType: "sale",
      status: "scheduled",
      thumbnailUrl: picsum("gv-sched-watch-sale", 1280, 720),
      viewerCount: 0,
      scheduledStartAt: schedWeekend,
      startedAt: null,
      items: [
        {
          id: "seed_lri_sale_sched_0",
          listingId: "m6",
          title: li("m6").title,
          imageUrl: picsum(li("m6").imageSeed, 400, 300),
          priceUsd: li("m6").price,
          startingBidUsd: null,
          currentBidUsd: null,
          status: "queued",
          sortOrder: 0,
        },
        {
          id: "seed_lri_sale_sched_1",
          listingId: null,
          title: "Omega Seamaster 300M — full set 2021",
          imageUrl: picsum("gv-watch-seamaster", 400, 300),
          priceUsd: 4200,
          startingBidUsd: null,
          currentBidUsd: null,
          status: "queued",
          sortOrder: 1,
        },
        {
          id: "seed_lri_sale_sched_2",
          listingId: null,
          title: "Tudor Black Bay 58 — full set 2023",
          imageUrl: picsum("gv-watch-bb58", 400, 300),
          priceUsd: 3450,
          startingBidUsd: null,
          currentBidUsd: null,
          status: "queued",
          sortOrder: 2,
        },
        {
          id: "seed_lri_sale_sched_3",
          listingId: null,
          title: "Cartier Tank Must — large quartz",
          imageUrl: picsum("gv-watch-tank", 400, 300),
          priceUsd: 2850,
          startingBidUsd: null,
          currentBidUsd: null,
          status: "queued",
          sortOrder: 3,
        },
      ],
      messages: [
        {
          id: "seed_lrm_sale_sched_0",
          senderKey: "seller",
          body: "Inventory is locked for this drop — SKUs will appear as we go live.",
          messageType: "system",
          createdAt: new Date("2026-06-01T09:00:00.000Z"),
        },
        {
          id: "seed_lrm_sale_sched_1",
          senderKey: "viewer",
          body: "Notify when Sub date goes up — looking for 2022 full set",
          messageType: "chat",
          createdAt: new Date("2026-06-01T10:15:00.000Z"),
        },
        {
          id: "seed_lrm_sale_sched_2",
          senderKey: "viewer",
          body: "Interested in the Speedmaster if reserve aligns with listing",
          messageType: "bid",
          createdAt: new Date("2026-06-01T11:00:00.000Z"),
        },
        {
          id: "seed_lrm_sale_sched_3",
          senderKey: "viewer",
          body: "DemoViewer reserved Rolex Submariner Date at list — pending invoice at go-live",
          messageType: "purchase",
          createdAt: new Date("2026-06-01T11:30:00.000Z"),
        },
      ],
    },
  ];

  for (const room of rooms) {
    const sellerId = seller(room.sellerUsername);
    await prisma.liveRoom.create({
      data: {
        id: room.id,
        sellerId,
        title: room.title,
        description: room.description,
        category: room.category,
        roomType: room.roomType,
        status: room.status,
        thumbnailUrl: room.thumbnailUrl,
        viewerCount: room.viewerCount,
        scheduledStartAt: room.scheduledStartAt,
        startedAt: room.startedAt,
        items: {
          create: room.items.map((it) => ({
            id: it.id,
            listingId: it.listingId,
            title: it.title,
            imageUrl: it.imageUrl,
            priceUsd: it.priceUsd,
            startingBidUsd: it.startingBidUsd,
            currentBidUsd: it.currentBidUsd,
            status: it.status,
            sortOrder: it.sortOrder,
          })),
        },
        messages: {
          create: room.messages.map((m) => ({
            id: m.id,
            senderId: m.senderKey === "seller" ? sellerId : demoViewer.id,
            body: m.body,
            messageType: m.messageType,
            createdAt: m.createdAt,
          })),
        },
      },
    });
  }
}

function emailForSeller(username: string) {
  const slug = username
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `seed+${slug || "seller"}@getvaulted.internal`;
}

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PRODUCTION_SEED !== "true") {
    // eslint-disable-next-line no-console
    console.log(
      "Seed skipped: NODE_ENV=production. Demo seed is for local/dev only. To force (dangerous), set ALLOW_PRODUCTION_SEED=true.",
    );
    return;
  }

  if (process.env.ALLOW_DEMO_SEED !== "true") {
    // eslint-disable-next-line no-console
    console.log(
      "Seed skipped: demo fixtures are opt-in. Set ALLOW_DEMO_SEED=true to insert seed marketplace listings, sellers, demo live rooms, and DemoViewer (dev/QA only).",
    );
    return;
  }

  const sellerIdByUsername = new Map<string, string>();

  for (const l of seedMarketplaceListings) {
    if (sellerIdByUsername.has(l.sellerUsername)) continue;
    const email = emailForSeller(l.sellerUsername);
    const baseUsername = l.sellerUsername.replace(/\s+/g, "").slice(0, 32) || "seller";
    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        username: baseUsername,
        name: l.sellerUsername,
      },
      update: { name: l.sellerUsername },
    });
    sellerIdByUsername.set(l.sellerUsername, user.id);
  }

  for (const l of seedMarketplaceListings) {
    const sellerId = sellerIdByUsername.get(l.sellerUsername)!;
    const status = l.buyingFormat === "auction" ? ("auction_live" as const) : ("active" as const);
    await prisma.listing.upsert({
      where: { id: l.id },
      create: {
        id: l.id,
        sellerId,
        title: l.title,
        description: l.longDescription ?? "",
        category: l.category,
        condition: l.condition,
        buyingFormat: l.buyingFormat,
        priceUsd: l.price,
        startingBidUsd: l.buyingFormat === "auction" ? l.price : null,
        currentBidUsd: l.buyingFormat === "auction" ? l.price : null,
        allowOffers: l.allowOffers === true,
        minimumOfferUsd: l.minimumOfferUsd ?? null,
        status,
        shippingPriceUsd: l.shippingPriceUsd ?? 0,
        handlingTime: l.handlingTimeLabel ?? "",
        signatureRequired: l.signatureRequired === true,
        reservePriceUsd: l.reservePrice ?? null,
        auctionDurationDays: l.auctionDurationDays ?? null,
        vaultPick: l.vaultPick === true,
        viewsCount: 48,
        watchersCount: 5,
      },
      update: {
        title: l.title,
        description: l.longDescription ?? "",
        category: l.category,
        condition: l.condition,
        buyingFormat: l.buyingFormat,
        priceUsd: l.price,
        startingBidUsd: l.buyingFormat === "auction" ? l.price : null,
        currentBidUsd: l.buyingFormat === "auction" ? l.price : null,
        allowOffers: l.allowOffers === true,
        minimumOfferUsd: l.minimumOfferUsd ?? null,
        status,
        shippingPriceUsd: l.shippingPriceUsd ?? 0,
        handlingTime: l.handlingTimeLabel ?? "",
        signatureRequired: l.signatureRequired === true,
        reservePriceUsd: l.reservePrice ?? null,
        auctionDurationDays: l.auctionDurationDays ?? null,
        vaultPick: l.vaultPick === true,
      },
    });
  }

  await seedDemoLiveRooms(sellerIdByUsername);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
