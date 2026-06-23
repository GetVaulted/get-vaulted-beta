/**
 * Screenshot-ready marketplace listings + live discovery tiles (public feeds).
 * Uses real-looking seller emails (NOT @getvaulted.internal) so home/marketplace APIs include them.
 *
 * Usage (from web/):
 *   ALLOW_SCREENSHOT_SEED=1 npx tsx scripts/seed-screenshot-demo.ts
 *   ALLOW_SCREENSHOT_SEED=1 npx tsx scripts/seed-screenshot-demo.ts --reset
 *
 * Optional: SCREENSHOT_SELLER_EMAIL=user@example.com — attach listings/rooms to an existing seller instead.
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  LiveRoomItemStatus,
  LiveRoomMessageType,
  LiveRoomStatus,
  LiveRoomType,
  PrismaClient,
} from "../src/generated/prisma/client";
import { resolveDatabaseUrl } from "../src/lib/resolve-database-url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

const SHOT_LISTING_IDS = [
  "shot_m1",
  "shot_m2",
  "shot_m3",
  "shot_m4",
  "shot_m5",
  "shot_m6",
  "shot_m7",
  "shot_m8",
  "shot_m9",
  "shot_m10",
  "shot_m11",
  "shot_m12",
] as const;

const SHOT_LIVE_ROOM_IDS = [
  "shot_lr_break_hero",
  "shot_lr_break_live2",
  "shot_lr_auction_hero",
  "shot_lr_sale_hero",
  "shot_lr_break_sched",
  "shot_lr_auction_sched",
] as const;

const SHOT_SELLER_EMAILS = [
  "screenshots.cardvault@getvaultedtest.com",
  "screenshots.grail@getvaultedtest.com",
  "screenshots.luxdrop@getvaultedtest.com",
] as const;

function assertEnv() {
  if (process.env.ALLOW_SCREENSHOT_SEED !== "1") {
    console.error("Refusing to run. Set ALLOW_SCREENSHOT_SEED=1");
    process.exit(1);
  }
  resolveDatabaseUrl();
}

function img(seed: string, w = 800, h = 800) {
  return `https://images.unsplash.com/${seed}?w=${w}&h=${h}&fit=crop&q=80&auto=format`;
}

function thumb(seed: string) {
  return img(seed, 1280, 720);
}

const CARD_A = img("photo-1609710228189-2a2de2785903");
const CARD_B = img("photo-1627686837868-0557747f7980");
const CARD_C = img("photo-1572635196243-4df6924fe3f4");
const SNEAKER_A = img("photo-1542291026-7eec264c27ff");
const SNEAKER_B = img("photo-1606107557195-0e29a4b5b4aa");
const WATCH_A = img("photo-1523170335258-f5ed11844a49");
const WATCH_B = img("photo-1524592094714-0f0654e20314");
const MEMO_A = img("photo-1579952363873-27f3bade9f55");

type ListingSeed = {
  id: (typeof SHOT_LISTING_IDS)[number];
  sellerIndex: 0 | 1 | 2;
  title: string;
  description: string;
  category: string;
  condition: string;
  priceUsd: number;
  vaultPick?: boolean;
  images: [string, string, string];
  viewsCount: number;
  watchersCount: number;
};

const LISTINGS: ListingSeed[] = [
  {
    id: "shot_m1",
    sellerIndex: 0,
    title: "2023 Prizm Victor Wembanyama RC Silver PSA 10",
    description: "Fresh slab from a personal break. Ships insured with signature.",
    category: "Trading Cards",
    condition: "PSA 10",
    priceUsd: 890,
    vaultPick: true,
    images: [CARD_A, CARD_B, CARD_C],
    viewsCount: 1240,
    watchersCount: 86,
  },
  {
    id: "shot_m2",
    sellerIndex: 0,
    title: "2018 Luka Doncic Optic Holo PSA 9",
    description: "Clean corners, strong centering. Open to reasonable offers.",
    category: "Trading Cards",
    condition: "PSA 9",
    priceUsd: 425,
    images: [CARD_B, CARD_A, CARD_C],
    viewsCount: 620,
    watchersCount: 41,
  },
  {
    id: "shot_m3",
    sellerIndex: 0,
    title: "Patrick Mahomes Mosaic Stained Glass /25 BGS 9.5",
    description: "Pop 12. Display-ready slab.",
    category: "Trading Cards",
    condition: "BGS 9.5",
    priceUsd: 1850,
    vaultPick: true,
    images: [CARD_C, CARD_A, CARD_B],
    viewsCount: 980,
    watchersCount: 63,
  },
  {
    id: "shot_m4",
    sellerIndex: 0,
    title: "Shohei Ohtani Topps Chrome Auto /99 PSA 8",
    description: "On-card auto. Vaulted since pull.",
    category: "Trading Cards",
    condition: "PSA 8",
    priceUsd: 3200,
    images: [CARD_A, CARD_C, CARD_B],
    viewsCount: 2100,
    watchersCount: 112,
  },
  {
    id: "shot_m5",
    sellerIndex: 1,
    title: "Air Jordan 1 Retro High OG Chicago (2015) Size 11",
    description: "Light creasing, OG all. Ships double-boxed.",
    category: "Sneakers",
    condition: "Used — Excellent",
    priceUsd: 2450,
    vaultPick: true,
    images: [SNEAKER_A, SNEAKER_B, SNEAKER_A],
    viewsCount: 890,
    watchersCount: 54,
  },
  {
    id: "shot_m6",
    sellerIndex: 1,
    title: "Nike Dunk Low Panda Size 10.5 DS",
    description: "Deadstock, receipt available.",
    category: "Sneakers",
    condition: "New",
    priceUsd: 185,
    images: [SNEAKER_B, SNEAKER_A, SNEAKER_B],
    viewsCount: 430,
    watchersCount: 28,
  },
  {
    id: "shot_m7",
    sellerIndex: 1,
    title: "Travis Scott x Jordan 1 Low Reverse Mocha Size 9",
    description: "Authenticated, OG box included.",
    category: "Sneakers",
    condition: "Used — Very Good",
    priceUsd: 1180,
    vaultPick: true,
    images: [SNEAKER_A, SNEAKER_B, SNEAKER_A],
    viewsCount: 1560,
    watchersCount: 97,
  },
  {
    id: "shot_m8",
    sellerIndex: 1,
    title: "New Balance 550 White Green Size 12 DS",
    description: "Quick ship from Texas.",
    category: "Sneakers",
    condition: "New",
    priceUsd: 145,
    images: [SNEAKER_B, SNEAKER_A, SNEAKER_B],
    viewsCount: 210,
    watchersCount: 12,
  },
  {
    id: "shot_m9",
    sellerIndex: 2,
    title: "Rolex Submariner Date 126610LN — 2022 Full Set",
    description: "Unpolished, warranty card dated 2022.",
    category: "Watches",
    condition: "Excellent",
    priceUsd: 14250,
    vaultPick: true,
    images: [WATCH_A, WATCH_B, WATCH_A],
    viewsCount: 3200,
    watchersCount: 188,
  },
  {
    id: "shot_m10",
    sellerIndex: 2,
    title: "Omega Speedmaster Professional Moonwatch",
    description: "Hesalite, full set, light desk wear.",
    category: "Watches",
    condition: "Very Good",
    priceUsd: 5200,
    images: [WATCH_B, WATCH_A, WATCH_B],
    viewsCount: 740,
    watchersCount: 45,
  },
  {
    id: "shot_m11",
    sellerIndex: 2,
    title: "Tom Brady Signed Patriots Mini Helmet (UDA)",
    description: "COA included. Display case optional.",
    category: "Memorabilia",
    condition: "Authenticated",
    priceUsd: 1895,
    vaultPick: true,
    images: [MEMO_A, CARD_A, MEMO_A],
    viewsCount: 510,
    watchersCount: 33,
  },
  {
    id: "shot_m12",
    sellerIndex: 2,
    title: "Cartier Tank Must Large — Quartz 2023",
    description: "Full set, barely worn.",
    category: "Luxury",
    condition: "Like New",
    priceUsd: 3150,
    images: [WATCH_A, WATCH_B, WATCH_A],
    viewsCount: 680,
    watchersCount: 39,
  },
];

const SELLERS = [
  {
    email: SHOT_SELLER_EMAILS[0],
    username: "CardVaultBreaks",
    name: "Card Vault Breaks",
    image: thumb("photo-1612872085524-b87601f7237f"),
  },
  {
    email: SHOT_SELLER_EMAILS[1],
    username: "GrailGarage",
    name: "Grail Garage",
    image: thumb("photo-1556906781-9a412961c28c"),
  },
  {
    email: SHOT_SELLER_EMAILS[2],
    username: "LuxDrop",
    name: "Lux Drop",
    image: thumb("photo-1518544889280-46c4f4a2cf0d"),
  },
] as const;

async function purgeShotData(prisma: PrismaClient) {
  await prisma.liveRoomMessage.deleteMany({
    where: { liveRoomId: { in: [...SHOT_LIVE_ROOM_IDS] } },
  });
  await prisma.liveRoomItem.deleteMany({
    where: { liveRoomId: { in: [...SHOT_LIVE_ROOM_IDS] } },
  });
  await prisma.liveRoom.deleteMany({ where: { id: { in: [...SHOT_LIVE_ROOM_IDS] } } });
  await prisma.listingImage.deleteMany({ where: { listingId: { in: [...SHOT_LISTING_IDS] } } });
  await prisma.listing.deleteMany({ where: { id: { in: [...SHOT_LISTING_IDS] } } });
}

async function ensureSellers(prisma: PrismaClient, overrideEmail?: string) {
  const ids: string[] = [];
  if (overrideEmail?.trim()) {
    const user = await prisma.user.findFirst({
      where: { email: { equals: overrideEmail.trim(), mode: "insensitive" } },
    });
    if (!user) throw new Error(`No user found for SCREENSHOT_SELLER_EMAIL=${overrideEmail}`);
    console.log(`Using existing seller ${user.email} (${user.username}) for all listings/rooms.`);
    return [user.id, user.id, user.id];
  }

  for (const s of SELLERS) {
    const user = await prisma.user.upsert({
      where: { email: s.email },
      create: {
        email: s.email,
        username: s.username,
        name: s.name,
        image: s.image,
        emailVerified: new Date(),
        sellerSetupWizardCompletedAt: new Date(),
        sellerAgreementAcceptedAt: new Date(),
        shipFromName: s.name,
        shipFromStreet: "100 Vault Way",
        shipFromCity: "Austin",
        shipFromState: "TX",
        shipFromZip: "78701",
        shipFromCountry: "US",
      },
      update: {
        name: s.name,
        image: s.image,
        sellerSetupWizardCompletedAt: new Date(),
        sellerAgreementAcceptedAt: new Date(),
        shipFromName: s.name,
        shipFromStreet: "100 Vault Way",
        shipFromCity: "Austin",
        shipFromState: "TX",
        shipFromZip: "78701",
        shipFromCountry: "US",
      },
    });
    ids.push(user.id);
  }
  return ids;
}

async function seedListings(prisma: PrismaClient, sellerIds: string[]) {
  for (const l of LISTINGS) {
    const sellerId = sellerIds[l.sellerIndex]!;
    await prisma.listing.upsert({
      where: { id: l.id },
      create: {
        id: l.id,
        sellerId,
        title: l.title,
        description: l.description,
        category: l.category,
        condition: l.condition,
        buyingFormat: "buy_now",
        priceUsd: l.priceUsd,
        status: "active",
        shippingPriceUsd: 0,
        handlingTime: "Ships in 1–2 business days",
        vaultPick: l.vaultPick === true,
        viewsCount: l.viewsCount,
        watchersCount: l.watchersCount,
        parcelWeightOz: 8,
        parcelLengthIn: 6,
        parcelWidthIn: 4,
        parcelHeightIn: 2,
        allowOffers: l.priceUsd >= 500,
        minimumOfferUsd: l.priceUsd >= 500 ? Math.round(l.priceUsd * 0.85) : null,
      },
      update: {
        sellerId,
        title: l.title,
        description: l.description,
        category: l.category,
        condition: l.condition,
        buyingFormat: "buy_now",
        priceUsd: l.priceUsd,
        status: "active",
        vaultPick: l.vaultPick === true,
        viewsCount: l.viewsCount,
        watchersCount: l.watchersCount,
        parcelWeightOz: 8,
        parcelLengthIn: 6,
        parcelWidthIn: 4,
        parcelHeightIn: 2,
        moderationRemovedAt: null,
      },
    });

    await prisma.listingImage.deleteMany({ where: { listingId: l.id } });
    await prisma.listingImage.createMany({
      data: l.images.map((url, sortOrder) => ({
        listingId: l.id,
        url,
        sortOrder,
      })),
    });
  }
}

async function seedLiveRooms(prisma: PrismaClient, sellerIds: string[]) {
  const listing = (id: (typeof SHOT_LISTING_IDS)[number]) => LISTINGS.find((l) => l.id === id)!;

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
    senderId: string;
    body: string;
    messageType: LiveRoomMessageType;
    createdAt: Date;
  };

  type RoomSeed = {
    id: (typeof SHOT_LIVE_ROOM_IDS)[number];
    sellerIndex: 0 | 1 | 2;
    title: string;
    description: string;
    category: string;
    roomType: LiveRoomType;
    status: LiveRoomStatus;
    thumbnailUrl: string;
    viewerCount: number;
    scheduledStartAt: Date | null;
    startedAt: Date | null;
    teamBoardLeague?: "nfl" | "nba" | "mlb";
    breakDisplayTitle?: string;
    items: ItemSeed[];
    messages: MsgSeed[];
  };

  const now = Date.now();
  const liveStarted = new Date(now - 45 * 60_000);
  const schedTonight = new Date(now + 3 * 60 * 60_000);
  const schedWeekend = new Date(now + 28 * 60 * 60_000);

  const viewer = await prisma.user.upsert({
    where: { email: "screenshots.viewer@getvaultedtest.com" },
    create: {
      email: "screenshots.viewer@getvaultedtest.com",
      username: "HypeViewer",
      name: "Hype Viewer",
    },
    update: {},
  });

  const rooms: RoomSeed[] = [
    {
      id: "shot_lr_break_hero",
      sellerIndex: 0,
      title: "National Treasures Basketball PYT — Prime Time",
      description:
        "32-team PYT rolling live. Last break: PSA 10 color hit — room went nuclear. Grab a spot before filler random.",
      category: "Breaks",
      roomType: "break",
      status: "live",
      thumbnailUrl: thumb("photo-1546519633-68ebb2508abb"),
      viewerCount: 2847,
      scheduledStartAt: null,
      startedAt: liveStarted,
      teamBoardLeague: "nba",
      breakDisplayTitle: "NT Basketball PYT",
      items: [
        {
          id: "shot_lri_bh_0",
          listingId: "shot_m1",
          title: listing("shot_m1").title,
          imageUrl: listing("shot_m1").images[0],
          priceUsd: 64,
          startingBidUsd: null,
          currentBidUsd: null,
          status: "active",
          sortOrder: 0,
        },
        {
          id: "shot_lri_bh_1",
          listingId: null,
          title: "Lakers PYT — Spot 14",
          imageUrl: thumb("photo-1504450750965-560829568e93"),
          priceUsd: 58,
          startingBidUsd: null,
          currentBidUsd: null,
          status: "queued",
          sortOrder: 1,
        },
        {
          id: "shot_lri_bh_2",
          listingId: null,
          title: "Celtics PYT — Spot 7",
          imageUrl: thumb("photo-1519861530258-c932d2f4a0d3"),
          priceUsd: 52,
          startingBidUsd: null,
          currentBidUsd: null,
          status: "queued",
          sortOrder: 2,
        },
      ],
      messages: [
        {
          id: "shot_lrm_bh_0",
          senderId: sellerIds[0]!,
          body: "Mic check — we are LIVE. First 5 spots get bonus entry.",
          messageType: "system",
          createdAt: new Date(now - 44 * 60_000),
        },
        {
          id: "shot_lrm_bh_1",
          senderId: viewer.id,
          body: "Lakers spot if still open 👀",
          messageType: "chat",
          createdAt: new Date(now - 42 * 60_000),
        },
      ],
    },
    {
      id: "shot_lr_break_live2",
      sellerIndex: 0,
      title: "Prizm Football Random Team — Sunday Night",
      description: "Random team wheel after sellout. 32 NFL teams, hits ship insured.",
      category: "Breaks",
      roomType: "break",
      status: "live",
      thumbnailUrl: thumb("photo-1560272564-c83bdeb66e84"),
      viewerCount: 1205,
      scheduledStartAt: null,
      startedAt: new Date(now - 20 * 60_000),
      teamBoardLeague: "nfl",
      breakDisplayTitle: "Prizm Football Random",
      items: [
        {
          id: "shot_lri_bl2_0",
          listingId: "shot_m3",
          title: listing("shot_m3").title,
          imageUrl: listing("shot_m3").images[0],
          priceUsd: 45,
          startingBidUsd: null,
          currentBidUsd: null,
          status: "active",
          sortOrder: 0,
        },
      ],
      messages: [],
    },
    {
      id: "shot_lr_auction_hero",
      sellerIndex: 1,
      title: "Grail Chase Auction Night — Slabs & Heat",
      description: "No reserve starts at $1 on select lots. Clutch time enabled on final minutes.",
      category: "Trading Cards",
      roomType: "auction",
      status: "live",
      thumbnailUrl: thumb("photo-1611532736597-dea7e7100679"),
      viewerCount: 1924,
      scheduledStartAt: null,
      startedAt: liveStarted,
      items: [
        {
          id: "shot_lri_ah_0",
          listingId: "shot_m5",
          title: listing("shot_m5").title,
          imageUrl: listing("shot_m5").images[0],
          priceUsd: null,
          startingBidUsd: 1,
          currentBidUsd: 875,
          status: "active",
          sortOrder: 0,
        },
        {
          id: "shot_lri_ah_1",
          listingId: "shot_m7",
          title: listing("shot_m7").title,
          imageUrl: listing("shot_m7").images[0],
          priceUsd: null,
          startingBidUsd: 1,
          currentBidUsd: 420,
          status: "queued",
          sortOrder: 1,
        },
      ],
      messages: [
        {
          id: "shot_lrm_ah_0",
          senderId: viewer.id,
          body: "Bid $900 on the Jordan 1",
          messageType: "bid",
          createdAt: new Date(now - 5 * 60_000),
        },
      ],
    },
    {
      id: "shot_lr_sale_hero",
      sellerIndex: 2,
      title: "Lux Drop — Watches & Memorabilia Buy Now",
      description: "Fixed-price vault drops. First tap wins — no waiting for auction close.",
      category: "Luxury",
      roomType: "sale",
      status: "live",
      thumbnailUrl: thumb("photo-1614164185127-d53c6090acf5"),
      viewerCount: 856,
      scheduledStartAt: null,
      startedAt: new Date(now - 15 * 60_000),
      items: [
        {
          id: "shot_lri_sh_0",
          listingId: "shot_m9",
          title: listing("shot_m9").title,
          imageUrl: listing("shot_m9").images[0],
          priceUsd: listing("shot_m9").priceUsd,
          startingBidUsd: null,
          currentBidUsd: null,
          status: "active",
          sortOrder: 0,
        },
        {
          id: "shot_lri_sh_1",
          listingId: "shot_m11",
          title: listing("shot_m11").title,
          imageUrl: listing("shot_m11").images[0],
          priceUsd: listing("shot_m11").priceUsd,
          startingBidUsd: null,
          currentBidUsd: null,
          status: "queued",
          sortOrder: 1,
        },
      ],
      messages: [],
    },
    {
      id: "shot_lr_break_sched",
      sellerIndex: 0,
      title: "Select Football Case Break — 9 PM ET",
      description: "Scheduled PYT with team board. Set reminder — spots move fast.",
      category: "Breaks",
      roomType: "break",
      status: "scheduled",
      thumbnailUrl: thumb("photo-1574629810360-7efbbe195018"),
      viewerCount: 412,
      scheduledStartAt: schedTonight,
      startedAt: null,
      teamBoardLeague: "nfl",
      breakDisplayTitle: "Select Football PYT",
      items: [],
      messages: [],
    },
    {
      id: "shot_lr_auction_sched",
      sellerIndex: 1,
      title: "Rookie Auto Marathon — Saturday Stream",
      description: "Multi-hour auction stream. Preview lots in the marketplace rail.",
      category: "Trading Cards",
      roomType: "auction",
      status: "scheduled",
      thumbnailUrl: thumb("photo-1580508087534-658542eccf9d"),
      viewerCount: 288,
      scheduledStartAt: schedWeekend,
      startedAt: null,
      items: [
        {
          id: "shot_lri_as_0",
          listingId: "shot_m2",
          title: listing("shot_m2").title,
          imageUrl: listing("shot_m2").images[0],
          priceUsd: null,
          startingBidUsd: 1,
          currentBidUsd: null,
          status: "queued",
          sortOrder: 0,
        },
      ],
      messages: [],
    },
  ];

  for (const room of rooms) {
    const sellerId = sellerIds[room.sellerIndex]!;
    await prisma.liveRoom.upsert({
      where: { id: room.id },
      create: {
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
        teamBoardLeague: room.teamBoardLeague ?? "nba",
        breakDisplayTitle: room.breakDisplayTitle ?? "",
        completedSalesGmvUsd: room.status === "live" ? 12450 : 0,
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
          create: room.messages,
        },
      },
      update: {
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
        teamBoardLeague: room.teamBoardLeague ?? "nba",
        breakDisplayTitle: room.breakDisplayTitle ?? "",
      },
    });

    await prisma.liveRoomItem.deleteMany({ where: { liveRoomId: room.id } });
    if (room.items.length > 0) {
      await prisma.liveRoomItem.createMany({
        data: room.items.map((it) => ({
          id: it.id,
          liveRoomId: room.id,
          listingId: it.listingId,
          title: it.title,
          imageUrl: it.imageUrl,
          priceUsd: it.priceUsd,
          startingBidUsd: it.startingBidUsd,
          currentBidUsd: it.currentBidUsd,
          status: it.status,
          sortOrder: it.sortOrder,
        })),
      });
    }

    await prisma.liveRoomMessage.deleteMany({ where: { liveRoomId: room.id } });
    if (room.messages.length > 0) {
      await prisma.liveRoomMessage.createMany({ data: room.messages.map((m) => ({ ...m, liveRoomId: room.id })) });
    }
  }
}

async function main() {
  assertEnv();
  const reset = process.argv.includes("--reset");
  const overrideEmail = process.env.SCREENSHOT_SELLER_EMAIL?.trim();

  const { prisma } = await import("../src/lib/prisma");

  if (reset) {
    console.log("--reset: removing prior screenshot seed rows…");
    await purgeShotData(prisma);
  }

  const sellerIds = await ensureSellers(prisma, overrideEmail);
  await seedListings(prisma, sellerIds);
  await seedLiveRooms(prisma, sellerIds);

  console.log("\nScreenshot demo seed complete.");
  console.log(`  Marketplace listings: ${SHOT_LISTING_IDS.length} (buy now, active, with images)`);
  console.log(`  Live rooms: ${SHOT_LIVE_ROOM_IDS.length} (live + scheduled, hype viewer counts)`);
  console.log("\nPublic feeds will show these unless LIVE_MARKETPLACE_ENABLED is off.");
  console.log("Re-run safely: ALLOW_SCREENSHOT_SEED=1 npx tsx scripts/seed-screenshot-demo.ts --reset");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("../src/lib/prisma");
    await prisma.$disconnect();
  });
