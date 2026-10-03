import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import type { BuyingFormat, ListingStatus, Prisma, ShippingCategory } from "@/generated/prisma/client";
import { EscrowStatus, LiveRoomStatus, LiveRoomType, OrderPaymentMethod } from "@/generated/prisma/enums";
import { PrismaClient } from "@/generated/prisma/client";
import { EXPECTED_BETA_PROJECT_REF } from "@/lib/beta-qa-scope";
import { createPostgresPrismaClient } from "@/lib/prisma-pg-factory";
import { setIntegrationPrismaClient } from "@/lib/prisma";
import {
  assertSupabaseIntegrationProjectReachable,
  normalizeIntegrationDatabaseUrl,
  supabaseProjectRefFromUrl,
} from "@/lib/resolve-database-url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const INTEGRATION_PROJECT_ROOT = join(__dirname, "..", "..");

let sharedClient: PrismaClient | null = null;

/**
 * Hardcoded, env-independent blocklist of Supabase project refs that integration tests must
 * never migrate, reset, or otherwise mutate — regardless of what .env / .env.local /
 * DATABASE_URL / DIRECT_URL currently resolve to. Add the production ref here too if it ever
 * differs from beta.
 */
const DESTRUCTIVE_OPERATION_BLOCKLIST: readonly string[] = [EXPECTED_BETA_PROJECT_REF];

/**
 * Refuse if `urlOrHost` (a full postgres URL, or a bare "host:port") resolves to a blocklisted
 * Supabase project ref. NOTE: Supabase pooler URLs (`postgres.<ref>@host:port`) encode the ref
 * in the *username*, which a bare "host:port" string does not carry — so this check alone
 * cannot detect a pooler-style beta host from `migrate status` output. It's still applied to
 * the *intended* dbUrl (which does have the full username) and to the *resolved* host as
 * defense-in-depth; the exact-host-string comparison in bootstrapIntegrationPrisma below is the
 * check that does not depend on ref-parsing and is the real backstop for pooler URLs.
 */
function assertNotDestructiveTarget(label: string, urlOrHost: string): void {
  const asUrl = urlOrHost.includes("://") ? urlOrHost : `postgresql://x@${urlOrHost}/x`;
  const ref = supabaseProjectRefFromUrl(asUrl);
  if (ref && DESTRUCTIVE_OPERATION_BLOCKLIST.includes(ref)) {
    throw new Error(
      `Refusing destructive integration-test operation: ${label} resolved to Supabase project "${ref}", ` +
        "which is a known beta/production project. This check is independent of .env, .env.local, " +
        "DATABASE_URL, and DIRECT_URL, and cannot be bypassed by environment configuration.",
    );
  }
}

function integrationDatabaseUrl(): string {
  const explicitIntegration = process.env.INTEGRATION_DATABASE_URL?.trim() ?? "";
  const url = explicitIntegration || process.env.DATABASE_URL?.trim() || "";
  if (!url) {
    throw new Error(
      "Set INTEGRATION_DATABASE_URL (preferred) or DATABASE_URL to a disposable PostgreSQL URL before running integration tests. See .env.example.",
    );
  }
  if (!url.startsWith("postgres://") && !url.startsWith("postgresql://")) {
    throw new Error("INTEGRATION_DATABASE_URL / DATABASE_URL must be a postgres:// or postgresql:// URI.");
  }
  const ref = supabaseProjectRefFromUrl(url);
  if (ref === EXPECTED_BETA_PROJECT_REF) {
    throw new Error(
      `Refusing integration tests against beta Supabase (${EXPECTED_BETA_PROJECT_REF}). ` +
        "Set INTEGRATION_DATABASE_URL to a disposable Postgres project — never beta DATABASE_URL.",
    );
  }
  return normalizeIntegrationDatabaseUrl(url);
}

/** Env for every Prisma CLI child process spawned against the integration DB. Forces BOTH
 *  DATABASE_URL and DIRECT_URL — prisma.config.ts resolves `DIRECT_URL || DATABASE_URL`, and
 *  DIRECT_URL in .env.local points at beta. Forcing only DATABASE_URL (the previous behavior)
 *  let `migrate deploy` silently resolve against beta instead of the disposable integration DB. */
function integrationCliEnv(dbUrl: string): NodeJS.ProcessEnv {
  return { ...process.env, DATABASE_URL: dbUrl, DIRECT_URL: dbUrl };
}

/**
 * Ask the Prisma CLI what datasource it actually resolved, using the exact env we're about to
 * run migrate/reset with. Deliberately does NOT rely on the command's exit code: `prisma migrate
 * status` exits non-zero whenever there are pending or failed migrations, which is the normal,
 * expected state of a disposable integration database before `migrate deploy` has run. We only
 * need its stdout, which prints the resolved datasource line before it evaluates migration state.
 */
function resolvePrismaDatasourceHost(env: NodeJS.ProcessEnv): string {
  let output: string;
  try {
    output = execSync("npx prisma migrate status", { cwd: INTEGRATION_PROJECT_ROOT, stdio: "pipe", env }).toString();
  } catch (err) {
    const stdout = (err as { stdout?: Buffer | string } | null)?.stdout;
    output = stdout ? stdout.toString() : "";
  }
  const match = output.match(/Datasource "db":.*?at "([^"]+)"/);
  if (!match) {
    throw new Error(
      "Could not determine the Prisma CLI's resolved datasource from `migrate status` output. Refusing to " +
        `proceed without confirming the target database.\n---\n${output}`,
    );
  }
  return match[1];
}

/** Apply migrations (`migrate deploy`) and return a connected Prisma client bound as the integration override. */
export async function bootstrapIntegrationPrisma(): Promise<PrismaClient> {
  const dbUrl = integrationDatabaseUrl();
  assertNotDestructiveTarget("intended integration database URL", dbUrl);
  await assertSupabaseIntegrationProjectReachable(dbUrl);

  const env = integrationCliEnv(dbUrl);
  const resolvedHost = resolvePrismaDatasourceHost(env);
  assertNotDestructiveTarget("Prisma CLI's resolved datasource", resolvedHost);

  const expectedHost = new URL(dbUrl.replace(/^postgresql:/, "http:").replace(/^postgres:/, "http:")).host;
  if (resolvedHost !== expectedHost) {
    throw new Error(
      `Refusing to run migrate deploy: Prisma CLI resolved the datasource to "${resolvedHost}", but the ` +
        `integration database is "${expectedHost}". This usually means DIRECT_URL or DATABASE_URL in ` +
        ".env.local overrode the integration override. Aborting before any migration runs.",
    );
  }

  execSync("npx prisma migrate deploy", { cwd: INTEGRATION_PROJECT_ROOT, stdio: "pipe", env });
  execSync("npx prisma generate", { cwd: INTEGRATION_PROJECT_ROOT, stdio: "pipe", env });
  if (sharedClient) {
    await sharedClient.$disconnect().catch(() => {});
  }
  sharedClient = createPostgresPrismaClient(dbUrl);
  await sharedClient.$connect();
  setIntegrationPrismaClient(sharedClient);
  return sharedClient;
}

export async function teardownIntegrationPrisma(): Promise<void> {
  if (sharedClient) {
    try {
      await resetIntegrationDatabase(sharedClient);
    } catch (e) {
      console.warn("[integration] teardown reset failed:", e);
    }
    await sharedClient.$disconnect().catch(() => {});
    sharedClient = null;
  }
  setIntegrationPrismaClient(undefined);
}

export async function resetIntegrationDatabase(p: PrismaClient): Promise<void> {
  await p.$transaction(async (tx) => {
    await tx.message.deleteMany();
    await tx.messageThread.deleteMany();
    await tx.watchlistItem.deleteMany();
    await tx.sellerFollow.deleteMany();
    await tx.webhookEventLog.deleteMany();
    await tx.sellerCommerceEvent.deleteMany();
    await tx.payoutEligibilityAuditLog.deleteMany();
    await tx.sellerPayoutMetrics.deleteMany();
    await tx.taxNexusState.deleteMany();
    await tx.notification.deleteMany();
    await tx.liveAuctionInventoryHold.deleteMany();
    await tx.liveRoomBid.deleteMany();
    await tx.liveBidIdempotency.deleteMany();
    await tx.liveAuctionEvent.deleteMany();
    await tx.liveAuctionProxyBid.deleteMany();
    await tx.liveShippingSessionItem.deleteMany();
    await tx.order.deleteMany();
    await tx.liveShippingSession.deleteMany();
    await tx.bid.deleteMany();
    await tx.offer.deleteMany();
    await tx.listingImage.deleteMany();
    await tx.hitClip.deleteMany();
    await tx.breakHit.deleteMany();
    await tx.breakSpot.deleteMany();
    await tx.liveRoomTeamBoardPick.deleteMany();
    await tx.liveRoomTeamBoard.deleteMany();
    await tx.liveRoomMessage.deleteMany();
    await tx.liveRoomItem.deleteMany();
    await tx.liveRoom.deleteMany();
    await tx.listing.deleteMany();
    await tx.user.deleteMany();
    await tx.taxNexusState.createMany({
      data: [{ stateCode: "TX", label: "Texas", enabled: true, registeredAt: new Date() }],
      skipDuplicates: true,
    });
  });
}

/** Plaintext password for all `seedUser()` accounts in integration tests. */
export const SEED_USER_PLAINTEXT_PASSWORD = "test-password-123";

export async function hashTestPassword(): Promise<string> {
  return bcrypt.hash(SEED_USER_PLAINTEXT_PASSWORD, 4);
}

export type SeedUserOpts = {
  email: string;
  username: string;
  role?: "user" | "admin";
  stripeAccountId?: string | null;
  stripeOnboardingComplete?: boolean;
  shipFrom?: Partial<{
    shipFromName: string;
    shipFromStreet: string;
    shipFromCity: string;
    shipFromState: string;
    shipFromZip: string;
    shipFromCountry: string;
  }>;
  /** Trustap external id (`1-…`) for escrow seller flows. */
  trustapUserId?: string | null;
};

export async function seedUser(p: PrismaClient, opts: SeedUserOpts) {
  const passwordHash = await hashTestPassword();
  const shipFrom = opts.shipFrom
    ? {
        shipFromName: opts.shipFrom.shipFromName ?? seedCompleteShipFrom.shipFromName,
        shipFromStreet: opts.shipFrom.shipFromStreet ?? seedCompleteShipFrom.shipFromStreet,
        shipFromCity: opts.shipFrom.shipFromCity ?? seedCompleteShipFrom.shipFromCity,
        shipFromState: opts.shipFrom.shipFromState ?? seedCompleteShipFrom.shipFromState,
        shipFromZip: opts.shipFrom.shipFromZip ?? seedCompleteShipFrom.shipFromZip,
        shipFromCountry: opts.shipFrom.shipFromCountry ?? seedCompleteShipFrom.shipFromCountry ?? "US",
      }
    : null;

  if (!shipFrom) {
    return p.user.create({
      data: {
        email: opts.email,
        username: opts.username,
        passwordHash,
        emailVerified: new Date(),
        role: opts.role ?? "user",
        stripeAccountId: opts.stripeAccountId ?? undefined,
        stripeOnboardingComplete: opts.stripeOnboardingComplete ?? false,
        ...(opts.trustapUserId !== undefined ? { trustapUserId: opts.trustapUserId } : {}),
      },
    });
  }

  return p.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: opts.email,
        username: opts.username,
        passwordHash,
        emailVerified: new Date(),
        role: opts.role ?? "user",
        stripeAccountId: opts.stripeAccountId ?? undefined,
        stripeOnboardingComplete: opts.stripeOnboardingComplete ?? false,
        shipFromName: shipFrom.shipFromName,
        shipFromStreet: shipFrom.shipFromStreet,
        shipFromCity: shipFrom.shipFromCity,
        shipFromState: shipFrom.shipFromState,
        shipFromZip: shipFrom.shipFromZip,
        shipFromCountry: shipFrom.shipFromCountry,
        ...(opts.trustapUserId !== undefined ? { trustapUserId: opts.trustapUserId } : {}),
      },
    });
    const address = await tx.address.create({
      data: {
        userId: user.id,
        type: "ship_from",
        name: "Shipping address",
        fullName: shipFrom.shipFromName,
        line1: shipFrom.shipFromStreet,
        city: shipFrom.shipFromCity,
        state: shipFrom.shipFromState,
        postalCode: shipFrom.shipFromZip,
        country: shipFrom.shipFromCountry,
        email: opts.email,
        phone: "5555550100",
        isDefault: true,
        isVerified: true,
      },
    });
    return tx.user.update({
      where: { id: user.id },
      data: { defaultShipFromAddressId: address.id },
    });
  });
}

/** Full ship-from used across integration seeds (live readiness, fulfillment). */
export const seedCompleteShipFrom = {
  shipFromName: "Integration Seller",
  shipFromStreet: "1 Main St",
  shipFromCity: "Austin",
  shipFromState: "TX",
  shipFromZip: "78701",
  shipFromCountry: "US",
} as const satisfies NonNullable<SeedUserOpts["shipFrom"]>;

export type SeedSellerStripeReadyOpts = Pick<SeedUserOpts, "email" | "username"> &
  Partial<Omit<SeedUserOpts, "email" | "username">>;

/** Seller with Connect-style fields ready for marketplace + live tests. */
export async function seedSellerStripeReady(p: PrismaClient, opts: SeedSellerStripeReadyOpts) {
  const trustapDefault = "1-seed-integration-seller";
  const trustapUserId = "trustapUserId" in opts ? opts.trustapUserId : trustapDefault;
  return seedUser(p, {
    ...opts,
    stripeAccountId: opts.stripeAccountId ?? "acct_test_integration_ready",
    stripeOnboardingComplete: opts.stripeOnboardingComplete ?? true,
    trustapUserId,
  });
}

export type SeedSellerStripeAndShipFromOpts = Pick<SeedUserOpts, "email" | "username"> &
  Partial<Omit<SeedUserOpts, "email" | "username" | "shipFrom">>;

export async function seedSellerStripeAndShipFrom(p: PrismaClient, opts: SeedSellerStripeAndShipFromOpts) {
  return seedSellerStripeReady(p, { ...opts, shipFrom: seedCompleteShipFrom });
}

export type SeedListingOpts = {
  sellerId: string;
  buyingFormat: BuyingFormat;
  status: ListingStatus;
  title?: string;
  category?: string;
  condition?: string;
  priceUsd?: number;
  startingBidUsd?: number | null;
  currentBidUsd?: number | null;
  shippingPriceUsd?: number;
  handlingTime?: string;
  reservePriceUsd?: number | null;
  auctionDurationDays?: number | null;
  auctionEndsAt?: Date | null;
  parcelWeightOz?: number | null;
  parcelLengthIn?: number | null;
  parcelWidthIn?: number | null;
  parcelHeightIn?: number | null;
  shippingCategory?: ShippingCategory;
  shippingBaseWeightOz?: number;
  shippingIncrementalWeightOz?: number;
  shippingPriceCapCents?: number | null;
  shipAlone?: boolean;
  vaultPick?: boolean;
  allowOffers?: boolean;
  acceptTradeOffers?: boolean;
};

export async function seedListing(p: PrismaClient, opts: SeedListingOpts) {
  const priceUsd = opts.priceUsd ?? opts.currentBidUsd ?? opts.startingBidUsd ?? 10;
  const base: Prisma.ListingUncheckedCreateInput = {
    sellerId: opts.sellerId,
    title: opts.title ?? "Integration listing",
    category: opts.category ?? "Sports Cards",
    condition: opts.condition ?? "Near Mint",
    buyingFormat: opts.buyingFormat,
    status: opts.status,
    priceUsd,
    shippingPriceUsd: opts.shippingPriceUsd ?? 0,
    handlingTime: opts.handlingTime ?? "",
  };
  const optional: Partial<Prisma.ListingUncheckedCreateInput> = {
    startingBidUsd: opts.startingBidUsd ?? undefined,
    currentBidUsd: opts.currentBidUsd ?? undefined,
    reservePriceUsd: opts.reservePriceUsd ?? undefined,
    auctionDurationDays: opts.auctionDurationDays ?? undefined,
    auctionEndsAt: opts.auctionEndsAt ?? undefined,
    parcelWeightOz: opts.parcelWeightOz ?? undefined,
    parcelLengthIn: opts.parcelLengthIn ?? undefined,
    parcelWidthIn: opts.parcelWidthIn ?? undefined,
    parcelHeightIn: opts.parcelHeightIn ?? undefined,
    shippingCategory: opts.shippingCategory ?? undefined,
    shippingBaseWeightOz: opts.shippingBaseWeightOz,
    shippingIncrementalWeightOz: opts.shippingIncrementalWeightOz,
    shippingPriceCapCents: opts.shippingPriceCapCents ?? undefined,
    shipAlone: opts.shipAlone,
    vaultPick: opts.vaultPick,
    allowOffers: opts.allowOffers,
    acceptTradeOffers: opts.acceptTradeOffers,
  };
  const extra = Object.fromEntries(
    Object.entries(optional).filter(([, v]) => v !== undefined),
  ) as Partial<Prisma.ListingUncheckedCreateInput>;
  return p.listing.create({ data: { ...base, ...extra } });
}

const defaultOrderShip = {
  shipRecipientName: "Test Buyer",
  shipAddress: "1 Test St",
  shipCity: "Austin",
  shipState: "TX",
  shipZip: "78701",
  shipCountry: "US",
} as const;

export type SeedOrderOpts = {
  listingId: string;
  buyerId: string;
  sellerId: string;
  itemPriceUsd: number;
  shippingPriceUsd: number;
  taxUsd?: number;
  totalUsd?: number;
  status?: string;
  paymentStatus?: string;
  fulfillmentStatus?: string;
  paymentMethod?: OrderPaymentMethod;
  paymentLabel?: string;
  escrowProvider?: string | null;
  escrowTransactionId?: string | null;
  escrowStatus?: EscrowStatus | null;
  escrowCheckoutUrl?: string | null;
  trustapBuyerUserId?: string | null;
  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  paymentDeadlineAt?: Date | null;
  shippoTransactionId?: string | null;
  liveShippingSessionId?: string | null;
  shippingChargedCents?: number | null;
  shippingLabelCostCents?: number | null;
  buyerAddressId?: string | null;
};

export async function seedOrder(p: PrismaClient, opts: SeedOrderOpts) {
  const taxUsd = opts.taxUsd ?? 0;
  const totalUsd = opts.totalUsd ?? opts.itemPriceUsd + opts.shippingPriceUsd + taxUsd;
  const base: Prisma.OrderUncheckedCreateInput = {
    listingId: opts.listingId,
    buyerId: opts.buyerId,
    sellerId: opts.sellerId,
    itemPriceUsd: opts.itemPriceUsd,
    shippingPriceUsd: opts.shippingPriceUsd,
    taxUsd,
    totalUsd,
    status: opts.status ?? "pending",
    paymentStatus: opts.paymentStatus ?? "pending",
    fulfillmentStatus: opts.fulfillmentStatus ?? "pending",
    paymentMethod: opts.paymentMethod ?? OrderPaymentMethod.stripe,
    paymentLabel: opts.paymentLabel ?? "card",
    ...defaultOrderShip,
  };
  const optional: Partial<Prisma.OrderUncheckedCreateInput> = {
    escrowProvider: opts.escrowProvider ?? undefined,
    escrowTransactionId: opts.escrowTransactionId ?? undefined,
    escrowStatus: opts.escrowStatus ?? undefined,
    escrowCheckoutUrl: opts.escrowCheckoutUrl ?? undefined,
    trustapBuyerUserId: opts.trustapBuyerUserId ?? undefined,
    stripeCheckoutSessionId: opts.stripeCheckoutSessionId ?? undefined,
    stripePaymentIntentId: opts.stripePaymentIntentId ?? undefined,
    paymentDeadlineAt: opts.paymentDeadlineAt ?? undefined,
    shippoTransactionId: opts.shippoTransactionId ?? undefined,
    liveShippingSessionId: opts.liveShippingSessionId ?? undefined,
    shippingChargedCents: opts.shippingChargedCents ?? undefined,
    shippingLabelCostCents: opts.shippingLabelCostCents ?? undefined,
    buyerAddressId: opts.buyerAddressId ?? undefined,
  };
  const extra = Object.fromEntries(
    Object.entries(optional).filter(([, v]) => v !== undefined),
  ) as Partial<Prisma.OrderUncheckedCreateInput>;
  return p.order.create({ data: { ...base, ...extra } });
}

export type SeedPaidOrderOpts = Omit<SeedOrderOpts, "paymentStatus" | "status"> & {
  paymentStatus?: string;
  status?: string;
};

export async function seedPaidOrder(p: PrismaClient, opts: SeedPaidOrderOpts) {
  return seedOrder(p, {
    ...opts,
    paymentStatus: opts.paymentStatus ?? "paid",
    status: opts.status ?? "paid",
  });
}

export type SeedBuyerShippingAddressOpts = {
  userId: string;
  fullName?: string;
  phone?: string;
  line1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

/**
 * Buyer shipping address with a valid, normalizable US contact phone. Required for Shippo
 * buyer-contact resolution — see `resolveBuyerShippoContact` / `BUYER_SHIPPO_CONTACT_MISSING`
 * in `@/lib/shippo-label-contacts`, which reads `Order.buyerAddress.phone` exclusively (there is
 * no fallback to a phone field on `User`). Any integration test whose order needs to reach the
 * real Shippo purchase path must create one of these and pass its id as `buyerAddressId` to
 * `seedOrder`.
 */
export async function seedBuyerShippingAddress(p: PrismaClient, opts: SeedBuyerShippingAddressOpts) {
  return p.address.create({
    data: {
      userId: opts.userId,
      type: "shipping",
      name: "Shipping address",
      fullName: opts.fullName ?? "Integration Buyer",
      line1: opts.line1 ?? "1 Test St",
      city: opts.city ?? "Austin",
      state: opts.state ?? "TX",
      postalCode: opts.postalCode ?? "78701",
      country: opts.country ?? "US",
      phone: opts.phone ?? "5555550100",
      isDefault: true,
      isVerified: true,
    },
  });
}

export type SeedBidOpts = {
  listingId: string;
  bidderId: string;
  amountUsd: number;
  maxBidUsd?: number | null;
  createdAt?: Date;
};

export async function seedBid(p: PrismaClient, opts: SeedBidOpts) {
  return p.bid.create({
    data: {
      listingId: opts.listingId,
      bidderId: opts.bidderId,
      amountUsd: opts.amountUsd,
      maxBidUsd: opts.maxBidUsd ?? opts.amountUsd,
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    },
  });
}

export async function seedListingImage(p: PrismaClient, listingId: string, url = "https://img.test/integration.png") {
  return p.listingImage.create({
    data: { listingId, url, sortOrder: 0 },
  });
}

export type SeedLiveRoomOpts = {
  id?: string;
  sellerId: string;
  status: LiveRoomStatus;
  title?: string;
  roomType?: LiveRoomType;
};

export async function seedLiveRoom(p: PrismaClient, opts: SeedLiveRoomOpts) {
  return p.liveRoom.create({
    data: {
      ...(opts.id ? { id: opts.id } : {}),
      sellerId: opts.sellerId,
      title: opts.title ?? "Integration room",
      roomType: opts.roomType ?? LiveRoomType.auction,
      status: opts.status,
    },
  });
}
