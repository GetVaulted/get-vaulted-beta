/**
 * Reset beta QA to a clean launch-simulation state (project xkaaicokjgmpbctfermj only).
 *
 * - Archives/deletes old QA clutter (NOT production-style accounts)
 * - Wipes commerce data for sellerqa + buyerqa, then re-provisions seller Stripe + buyer wallet
 * - Does NOT touch users outside QA scope
 *
 * Requires:
 *   CONFIRM_BETA_QA_RESET=1
 *   ALLOW_BETA_QA_SEED=1
 *   DATABASE_URL + SUPABASE service role (same as seed-beta-qa-accounts)
 *
 * Usage (from web/):
 *   CONFIRM_BETA_QA_RESET=1 ALLOW_BETA_QA_SEED=1 npm run qa:reset-beta-environment
 *   CONFIRM_BETA_QA_RESET=1 ALLOW_BETA_QA_SEED=1 npm run qa:reset-beta-environment -- --dry-run
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  BETA_QA_BUYER_EMAIL,
  BETA_QA_BUYER_USERNAME,
  BETA_QA_SELLER_EMAIL,
  BETA_QA_SELLER_USERNAME,
  EXPECTED_BETA_PROJECT_REF,
  isCanonicalBetaQaEmail,
  isDeletableFixtureEmail,
  isQaClutterAccount,
} from "../src/lib/beta-qa-scope";
import { seedMarketplaceListings } from "../prisma/seed-marketplace-fixtures";
import { ensureStripeCustomerIdForUser } from "../src/lib/stripe-customer";
import { getStripe, isStripeConfigured } from "../src/lib/stripe";
import { prisma } from "../src/lib/prisma";
import { resolveDatabaseUrl, supabaseProjectRefFromUrl } from "../src/lib/resolve-database-url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

const SEED_LIVE_ROOM_IDS = [
  "seed_lr_break_live",
  "seed_lr_sale_live",
  "seed_lr_auction_live",
  "seed_lr_auction_sched",
  "seed_lr_sale_sched",
] as const;

const dryRun = process.argv.includes("--dry-run");

function log(msg: string) {
  // eslint-disable-next-line no-console
  console.log(dryRun ? `[dry-run] ${msg}` : msg);
}

function assertEnv() {
  if (process.env.CONFIRM_BETA_QA_RESET !== "1") {
    console.error("Refusing: set CONFIRM_BETA_QA_RESET=1 to reset beta QA commerce data.");
    process.exit(1);
  }
  if (process.env.ALLOW_BETA_QA_SEED !== "1") {
    console.error("Refusing: set ALLOW_BETA_QA_SEED=1 (same guard as account seed).");
    process.exit(1);
  }

  const dbRef = supabaseProjectRefFromUrl(resolveDatabaseUrl());
  const supabaseUrl = process.env.SUPABASE_URL?.trim() ?? process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const supaRef = supabaseProjectRefFromUrl(supabaseUrl);
  if (dbRef !== EXPECTED_BETA_PROJECT_REF || supaRef !== EXPECTED_BETA_PROJECT_REF) {
    console.error(
      `Refusing: expected Supabase project ref ${EXPECTED_BETA_PROJECT_REF}, got db=${dbRef ?? "?"} supabase=${supaRef ?? "?"}.`,
    );
    process.exit(1);
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceKey) {
    console.error("Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in web/.env");
    process.exit(1);
  }

  return { supabaseUrl, serviceKey };
}

async function purgeDemoSeedRows(p: PrismaClient) {
  log("Phase 1 — purge Prisma demo seed rows …");
  const listingIds = seedMarketplaceListings.map((l) => l.id);

  if (dryRun) {
    const rooms = await p.liveRoom.count({ where: { id: { in: [...SEED_LIVE_ROOM_IDS] } } });
    const listings = await p.listing.count({ where: { id: { in: listingIds } } });
    const users = await p.user.count({ where: { email: { endsWith: "@getvaulted.internal" } } });
    log(`  would delete ${rooms} seed live rooms, ${listings} fixture listings, ${users} getvaulted.internal users`);
    return;
  }

  const rooms = await p.liveRoom.deleteMany({ where: { id: { in: [...SEED_LIVE_ROOM_IDS] } } });
  log(`  deleted ${rooms.count} seed live rooms`);

  const listings = await p.listing.deleteMany({ where: { id: { in: listingIds } } });
  log(`  deleted ${listings.count} seed marketplace listings`);

  const qaUsers = await p.user.deleteMany({
    where: {
      OR: [
        { email: { endsWith: "@getvaulted.internal" } },
        {
          AND: [{ email: { startsWith: "qa_live_seller_" } }, { email: { endsWith: "@test.internal" } }],
        },
        {
          AND: [{ email: { startsWith: "qa_live_buyer_" } }, { email: { endsWith: "@test.internal" } }],
        },
      ],
    },
  });
  log(`  deleted ${qaUsers.count} disposable fixture users (cascade listings/rooms)`);
}

async function archiveClutterAccounts(p: PrismaClient) {
  log("Phase 2 — archive legacy QA clutter (non-canonical) …");

  const allUsers = await p.user.findMany({
    select: { id: true, email: true, username: true },
  });

  const archiveIds: string[] = [];
  const deleteIds: string[] = [];

  for (const u of allUsers) {
    if (isCanonicalBetaQaEmail(u.email)) continue;
    if (!isQaClutterAccount(u.email, u.username)) continue;
    if (isDeletableFixtureEmail(u.email)) {
      deleteIds.push(u.id);
    } else {
      archiveIds.push(u.id);
    }
  }

  log(`  archive ${archiveIds.length} clutter account(s), delete ${deleteIds.length} fixture user(s)`);

  if (dryRun) {
    if (archiveIds.length) {
      const rooms = await p.liveRoom.count({
        where: { sellerId: { in: archiveIds }, status: { in: ["scheduled", "live"] } },
      });
      const listings = await p.listing.count({
        where: {
          sellerId: { in: archiveIds },
          status: { in: ["active", "auction_live", "draft", "awaiting_auction_payment"] },
        },
      });
      log(`  would end ${rooms} live rooms + hide ${listings} listings for clutter sellers`);
    }
    return;
  }

  if (archiveIds.length) {
    const now = new Date();
    const rooms = await p.liveRoom.updateMany({
      where: { sellerId: { in: archiveIds }, status: { in: ["scheduled", "live"] } },
      data: { status: "ended", endedAt: now },
    });
    const listings = await p.listing.updateMany({
      where: {
        sellerId: { in: archiveIds },
        status: { in: ["active", "auction_live", "draft", "awaiting_auction_payment"] },
      },
      data: { status: "ended", moderationRemovedAt: now },
    });
    log(`  ended ${rooms.count} clutter live rooms, hid ${listings.count} clutter listings`);
  }

  if (deleteIds.length) {
    for (const userId of deleteIds) {
      await purgeCommerceForUserIds(p, [userId], { includeLiveRooms: true, includeListings: true });
      await p.user.delete({ where: { id: userId } }).catch(() => {
        log(`  warning: could not delete fixture user ${userId} (orders may remain)`);
      });
    }
  }
}

async function purgeCommerceForUserIds(
  p: PrismaClient,
  userIds: string[],
  opts: { includeLiveRooms: boolean; includeListings: boolean },
) {
  if (!userIds.length) return;

  if (dryRun) {
    const orders = await p.order.count({
      where: { OR: [{ buyerId: { in: userIds } }, { sellerId: { in: userIds } }] },
    });
    const rooms = opts.includeLiveRooms
      ? await p.liveRoom.count({ where: { sellerId: { in: userIds } } })
      : 0;
    const listings = opts.includeListings
      ? await p.listing.count({ where: { sellerId: { in: userIds } } })
      : 0;
    log(`  would purge orders=${orders} rooms=${rooms} listings=${listings} for ${userIds.length} user(s)`);
    return;
  }

  await p.liveBidIdempotency.deleteMany({ where: { userId: { in: userIds } } });
  await p.liveAuctionInventoryHold.deleteMany({
    where: { OR: [{ userId: { in: userIds } }, { listing: { sellerId: { in: userIds } } }] },
  });
  await p.liveAuctionProxyBid.deleteMany({ where: { userId: { in: userIds } } });

  await p.order.deleteMany({
    where: { OR: [{ buyerId: { in: userIds } }, { sellerId: { in: userIds } }] },
  });

  if (opts.includeLiveRooms) {
    await p.liveRoom.deleteMany({ where: { sellerId: { in: userIds } } });
  }

  await p.tradeOffer.deleteMany({
    where: { OR: [{ proposerId: { in: userIds } }, { recipientId: { in: userIds } }] },
  });

  if (opts.includeListings) {
    await p.listing.deleteMany({ where: { sellerId: { in: userIds } } });
  }

  await p.bid.deleteMany({ where: { bidderId: { in: userIds } } });
  await p.offer.deleteMany({
    where: { OR: [{ buyerId: { in: userIds } }, { sellerId: { in: userIds } }] },
  });
  await p.messageThread.deleteMany({
    where: { OR: [{ buyerId: { in: userIds } }, { sellerId: { in: userIds } }] },
  });
  await p.notification.deleteMany({ where: { userId: { in: userIds } } });
  await p.address.deleteMany({ where: { userId: { in: userIds } } });
  await p.sellerCommerceEvent.deleteMany({ where: { sellerId: { in: userIds } } });
  await p.watchlistItem.deleteMany({ where: { userId: { in: userIds } } });
  await p.sellerFollow.deleteMany({
    where: { OR: [{ followerId: { in: userIds } }, { sellerId: { in: userIds } }] },
  });
}

async function resetCanonicalQaAccounts(p: PrismaClient) {
  log("Phase 3 — wipe commerce state for sellerqa + buyerqa …");

  const canonical = await p.user.findMany({
    where: {
      OR: [
        { email: { equals: BETA_QA_SELLER_EMAIL, mode: "insensitive" } },
        { email: { equals: BETA_QA_BUYER_EMAIL, mode: "insensitive" } },
      ],
    },
    select: { id: true, email: true },
  });

  const ids = canonical.map((u) => u.id);
  if (ids.length === 0) {
    log("  canonical QA users not found — will bootstrap in phase 4");
    return;
  }

  await purgeCommerceForUserIds(p, ids, { includeLiveRooms: true, includeListings: true });

  if (!dryRun && ids.length) {
    await p.user.updateMany({
      where: { id: { in: ids } },
      data: {
        defaultShipFromAddressId: null,
        stripeCustomerId: null,
        stripeRequirementsDue: null,
        stripeVerificationStatus: null,
      },
    });
  }

  log(`  purged commerce for ${ids.length} canonical account(s)`);
}

async function findAuthUserIdByEmail(
  admin: ReturnType<typeof createClient>,
  email: string,
): Promise<string | null> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
  if (error) throw new Error(error.message);
  const hit = (data.users ?? []).find((u) => u.email?.toLowerCase() === email.toLowerCase());
  return hit?.id ?? null;
}

function qaPassword(): string {
  return process.env.BETA_QA_ACCOUNT_PASSWORD?.trim() || process.env.BETA_QA_PASSWORD?.trim() || "VaultedBetaQA1!";
}

async function ensureCanonicalAccounts(
  p: PrismaClient,
  admin: ReturnType<typeof createClient>,
) {
  log("Phase 4 — ensure sellerqa + buyerqa Auth + Prisma rows …");
  if (dryRun) {
    for (const email of [BETA_QA_SELLER_EMAIL, BETA_QA_BUYER_EMAIL]) {
      const authId = await findAuthUserIdByEmail(admin, email);
      const row = await p.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
      log(`  ${email}: auth=${authId ? "yes" : "missing"} prisma=${row ? "yes" : "missing"}`);
    }
    return;
  }

  const specs = [
    {
      email: BETA_QA_SELLER_EMAIL,
      username: BETA_QA_SELLER_USERNAME,
      displayName: "Seller QA",
      isSeller: true,
    },
    {
      email: BETA_QA_BUYER_EMAIL,
      username: BETA_QA_BUYER_USERNAME,
      displayName: "Buyer QA",
      isSeller: false,
    },
  ];

  for (const spec of specs) {
    let authId = await findAuthUserIdByEmail(admin, spec.email);
    if (!authId) {
      const password = qaPassword();
      const { data, error } = await admin.auth.admin.createUser({
        email: spec.email,
        password,
        email_confirm: true,
        user_metadata: { username: spec.username, display_name: spec.displayName },
      });
      if (error) throw new Error(`createUser ${spec.email}: ${error.message}`);
      authId = data.user?.id ?? null;
      if (!authId) throw new Error(`No auth id for ${spec.email}`);
      log(`  created Supabase Auth user ${spec.email}`);
    }

    const existing = await p.user.findFirst({
      where: { OR: [{ email: spec.email }, { username: spec.username }] },
    });
    if (!existing) {
      await p.user.create({
        data: {
          id: authId,
          email: spec.email.toLowerCase(),
          username: spec.username,
          name: spec.displayName,
          emailVerified: new Date(),
          shipFromName: spec.isSeller ? "Seller QA Ship From" : undefined,
          shipFromStreet: spec.isSeller ? "100 Beta QA Blvd" : undefined,
          shipFromCity: spec.isSeller ? "Austin" : undefined,
          shipFromState: spec.isSeller ? "TX" : undefined,
          shipFromZip: spec.isSeller ? "78701" : undefined,
          shipFromCountry: spec.isSeller ? "US" : undefined,
        },
      });
      log(`  created Prisma User ${spec.email}`);
    } else if (existing.id !== authId) {
      log(`  warning: Prisma id mismatch for ${spec.email} — manual fix may be needed`);
    }
  }
}

async function provisionSellerAndBuyer(p: PrismaClient) {
  log("Phase 5 — provision seller Stripe + buyer shipping/card …");

  const seller = await p.user.findFirst({
    where: { email: { equals: BETA_QA_SELLER_EMAIL, mode: "insensitive" } },
    select: { id: true },
  });
  const buyer = await p.user.findFirst({
    where: { email: { equals: BETA_QA_BUYER_EMAIL, mode: "insensitive" } },
    select: { id: true },
  });

  if (!seller || !buyer) {
    log("  skip — canonical accounts missing");
    return;
  }

  if (dryRun) {
    log("  would set seller Stripe snapshot + ship-from, seed buyer address + test card");
    return;
  }

  await p.user.update({
    where: { id: seller.id },
    data: {
      stripeAccountId: "acct_beta_qa_smoke",
      stripeOnboardingComplete: true,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeRequirementsDue: null,
      stripeVerificationStatus: null,
      shipFromName: "Seller QA Ship From",
      shipFromStreet: "100 Beta QA Blvd",
      shipFromCity: "Austin",
      shipFromState: "TX",
      shipFromZip: "78701",
      shipFromCountry: "US",
    },
  });
  log("  sellerqa: Stripe Connect snapshot + ship-from ready");

  const shipCount = await p.address.count({ where: { userId: buyer.id, type: "shipping" } });
  if (shipCount === 0) {
    await p.address.create({
      data: {
        userId: buyer.id,
        type: "shipping",
        name: "Home",
        fullName: "Buyer QA",
        line1: "200 Beta Buyer St",
        city: "Austin",
        state: "TX",
        postalCode: "78702",
        country: "US",
        isDefault: true,
      },
    });
    log("  buyerqa: created default shipping address");
  } else {
    log(`  buyerqa: ${shipCount} shipping address(es) already present`);
  }

  if (isStripeConfigured()) {
    const customerId = await ensureStripeCustomerIdForUser(buyer.id);
    const stripe = getStripe();
    const cards = await stripe.paymentMethods.list({ customer: customerId, type: "card" });
    if (cards.data.length === 0) {
      const pm = await stripe.paymentMethods.create({
        type: "card",
        card: { token: "tok_visa" },
      });
      await stripe.paymentMethods.attach(pm.id, { customer: customerId });
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: pm.id },
      });
      log(`  buyerqa: attached test card (${customerId})`);
    } else {
      log(`  buyerqa: ${cards.data.length} saved card(s) on file`);
    }
  } else {
    log("  STRIPE_SECRET_KEY not set — run node scripts/_beta-seed-buyer-card.mjs after reset");
  }
}

async function printSummary(p: PrismaClient) {
  const seller = await p.user.findFirst({
    where: { email: { equals: BETA_QA_SELLER_EMAIL, mode: "insensitive" } },
    select: {
      id: true,
      stripeOnboardingComplete: true,
      stripeChargesEnabled: true,
      _count: { select: { listings: true, liveRooms: true, sales: true } },
    },
  });
  const buyer = await p.user.findFirst({
    where: { email: { equals: BETA_QA_BUYER_EMAIL, mode: "insensitive" } },
    select: {
      id: true,
      _count: { select: { orders: true, bids: true, addresses: true } },
    },
  });

  const publicRooms = await p.liveRoom.count({
    where: { status: { in: ["scheduled", "live"] }, seller: { email: BETA_QA_SELLER_EMAIL } },
  });
  const activeListings = await p.listing.count({
    where: {
      seller: { email: BETA_QA_SELLER_EMAIL },
      status: { in: ["active", "auction_live"] },
    },
  });

  log("\n=== Beta QA reset summary ===");
  log(`Seller listings: ${seller?._count.listings ?? 0} | live rooms: ${seller?._count.liveRooms ?? 0} | sales: ${seller?._count.sales ?? 0}`);
  log(`Seller Stripe ready: ${seller?.stripeOnboardingComplete && seller?.stripeChargesEnabled ? "yes" : "no"}`);
  log(`Buyer orders: ${buyer?._count.orders ?? 0} | bids: ${buyer?._count.bids ?? 0} | addresses: ${buyer?._count.addresses ?? 0}`);
  log(`Seller public rooms (scheduled/live): ${publicRooms} | active listings: ${activeListings}`);
  log(`Password: ${qaPassword()}`);
  log("\nNext:");
  log("  1. Clear QA session on all clients (Settings → QA environment → Clear session)");
  log("  2. Sign in sellerqa + buyerqa on PC / mobile");
  log("  3. Follow web/docs/launch-readiness-checklist.md");
  log("  4. Optional smoke: node scripts/_beta-marketplace-smoke.mjs");
}

async function main() {
  const { supabaseUrl, serviceKey } = assertEnv();
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  log(`Beta QA environment reset (project ${EXPECTED_BETA_PROJECT_REF})${dryRun ? " [DRY RUN]" : ""}\n`);

  await purgeDemoSeedRows(prisma);
  await archiveClutterAccounts(prisma);
  await resetCanonicalQaAccounts(prisma);
  await ensureCanonicalAccounts(prisma, admin);
  await provisionSellerAndBuyer(prisma);
  await printSummary(prisma);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
