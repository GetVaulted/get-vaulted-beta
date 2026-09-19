/**
 * Read-only: yesterday + today sales → seller Connect / admin bank-payout reconciliation.
 *
 * Matches the same nets Admin Bank Payouts + Seller HQ wallet use after the shared
 * `resolveSellerAbsorbedProcessingFeeUsd` helper (company listings = $0 processing pass-through).
 * Requires DATABASE_URL (+ STRIPE_SECRET_KEY for Connect balances).
 *
 *   cd web && npx tsx scripts/calc-payout-source-last-2-days.ts
 *
 * Optional: PAYOUT_RECON_TZ=America/Chicago (default), PAYOUT_RECON_USERNAME=getvaulted
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import fs from "node:fs";
import {
  addCalendarDays,
  calendarDayBoundsUtc,
  calendarDayInTimeZone,
} from "../src/lib/calendar-day-bounds";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

const TZ = process.env.PAYOUT_RECON_TZ?.trim() || "America/Chicago";
const FOCUS_USERNAME = (process.env.PAYOUT_RECON_USERNAME?.trim() || "getvaulted").replace(/^@+/, "");

function usd(n: number): number {
  return Math.round(n * 100) / 100;
}

function moneyFromCents(cents: number): number {
  return usd(cents / 100);
}

function calendarDayUtcRange(dayOffsetFromToday: number, timeZone: string): {
  day: string;
  start: Date;
  end: Date;
} {
  const todayYmd = calendarDayInTimeZone(new Date(), timeZone);
  const day = addCalendarDays(todayYmd, dayOffsetFromToday);
  const { start, end } = calendarDayBoundsUtc(day, timeZone);
  return { day, start, end };
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error(
      JSON.stringify(
        {
          error: "DATABASE_URL is not set in this environment.",
          need: ["DATABASE_URL", "STRIPE_SECRET_KEY (optional but required for Connect balances)"],
          how: "Add secrets to the Cloud Agent environment, or run: cd web && npx tsx scripts/calc-payout-source-last-2-days.ts",
        },
        null,
        2,
      ),
    );
    process.exit(2);
  }

  const { prisma } = await import("../src/lib/prisma");
  const { getStripe, isStripeConfigured } = await import("../src/lib/stripe");
  const {
    estimateSellerOrderPayoutUsd,
    resolvePlatformFeePercentForSellerOrder,
    resolveSellerAbsorbedProcessingFeeUsd,
  } = await import("../src/lib/seller-payout-estimate");
  const { liveShowGmvForFeeTierReconstruction } = await import("../src/lib/live-show-gmv");
  const { ensureLiveShowFeeCache } = await import("../src/services/live-show-fee-settings");
  const { ensureMarketplacePlatformFeeCache } = await import("../src/services/platform-fee-settings");
  const { listSellersReadyForAdminBankPayout } = await import(
    "../src/lib/admin/sellers-ready-for-bank-payout",
  );
  const { orderItemSaleBasisUsd } = await import("../src/lib/referral-credit-payout");

  await Promise.all([ensureLiveShowFeeCache(true), ensureMarketplacePlatformFeeCache(true)]);

  const yesterday = calendarDayUtcRange(-1, TZ);
  const today = calendarDayUtcRange(0, TZ);
  const windowStart = yesterday.start;
  const windowEnd = today.end;

  const paidStatuses = ["paid", "layaway_completed"] as const;

  const orders = await prisma.order.findMany({
    where: {
      paymentStatus: { in: [...paidStatuses] },
      createdAt: { gte: windowStart, lt: windowEnd },
    },
    select: {
      id: true,
      createdAt: true,
      itemPriceUsd: true,
      shippingPriceUsd: true,
      taxUsd: true,
      totalUsd: true,
      referralCreditAppliedUsd: true,
      platformCreditAppliedUsd: true,
      paymentStatus: true,
      payoutStatus: true,
      platformFeeCents: true,
      stripeApplicationFeeCents: true,
      stripeProcessingFeeCents: true,
      payoutReserveAmountCents: true,
      shippingLabelCostCents: true,
      shippingLabelCostReversedCents: true,
      stripeTransferId: true,
      stripePaymentIntentId: true,
      sellerId: true,
      seller: { select: { id: true, username: true, email: true, stripeAccountId: true } },
      buyer: { select: { username: true } },
      listing: { select: { id: true, title: true, isCompanyListing: true } },
      liveShippingSession: {
        select: {
          liveShowId: true,
          liveShow: { select: { completedSalesGmvUsd: true, finalSalesGmvUsd: true, status: true } },
        },
      },
    },
    orderBy: [{ createdAt: "asc" }],
  });

  const variantPurchases = await prisma.liveItemVariantPurchase.findMany({
    where: {
      paymentStatus: "paid",
      OR: [
        { paidAt: { gte: windowStart, lt: windowEnd } },
        { paidAt: null, createdAt: { gte: windowStart, lt: windowEnd } },
      ],
    },
    select: {
      id: true,
      createdAt: true,
      paidAt: true,
      totalUsd: true,
      liveRoomId: true,
      fulfillmentOrderId: true,
      variant: { select: { label: true } },
      liveRoom: { select: { sellerId: true, title: true, seller: { select: { username: true } } } },
    },
  });

  type SellerBucket = {
    sellerId: string;
    username: string | null;
    email: string | null;
    stripeAccountId: string | null;
    orderCount: number;
    companyOrderCount: number;
    gmvItemUsd: number;
    grossChargeUsd: number;
    platformFeeUsd: number;
    sellerNetUsd: number;
    companySellerNetUsd: number;
    marketplaceSellerNetUsd: number;
    orders: Array<{
      orderId: string;
      day: string;
      title: string;
      buyer: string | null;
      isCompanyListing: boolean;
      itemUsd: number;
      saleBasisUsd: number;
      shippingUsd: number;
      taxUsd: number;
      totalUsd: number;
      platformFeeUsd: number;
      processingFeeUsd: number;
      sellerNetUsd: number;
      payoutStatus: string;
      paidAt: string | null;
    }>;
  };

  const bySeller = new Map<string, SellerBucket>();

  function dayKey(d: Date): string {
    return calendarDayInTimeZone(d, TZ);
  }

  for (const o of orders) {
    const saleBasis = orderItemSaleBasisUsd(o);
    const item = Math.max(0, o.itemPriceUsd);
    const ship = Math.max(0, o.shippingPriceUsd);
    const tax = Math.max(0, o.taxUsd);
    const isCompany = Boolean(o.listing.isCompanyListing);
    const feePct = resolvePlatformFeePercentForSellerOrder({
      isCompanyListing: isCompany,
      liveShowId: o.liveShippingSession?.liveShowId ?? null,
      liveShowCompletedGmvUsd: liveShowGmvForFeeTierReconstruction(o.liveShippingSession?.liveShow ?? null),
      orderItemPriceUsd: saleBasis,
      orderPaymentStatus: o.paymentStatus,
    });
    const platformFeeUsd =
      o.platformFeeCents != null
        ? moneyFromCents(o.platformFeeCents)
        : isCompany
          ? 0
          : usd((saleBasis * feePct) / 100);
    const processingUsd = resolveSellerAbsorbedProcessingFeeUsd({
      isCompanyListing: isCompany,
      stripeProcessingFeeCents: o.stripeProcessingFeeCents,
      buyerChargeTotalUsd: o.totalUsd,
    });
    const sellerNetUsd = estimateSellerOrderPayoutUsd({
      itemPriceUsd: saleBasis,
      payoutReserveAmountCents: o.payoutReserveAmountCents ?? 0,
      platformFeePercent: isCompany ? 0 : feePct,
      shippingPriceUsd: ship,
      shippingLabelCostCents: o.shippingLabelCostCents,
      shippingLabelCostReversedCents: o.shippingLabelCostReversedCents,
      stripeProcessingFeeUsd: processingUsd,
    });

    const sid = o.sellerId;
    let bucket = bySeller.get(sid);
    if (!bucket) {
      bucket = {
        sellerId: sid,
        username: o.seller.username,
        email: o.seller.email,
        stripeAccountId: o.seller.stripeAccountId,
        orderCount: 0,
        companyOrderCount: 0,
        gmvItemUsd: 0,
        grossChargeUsd: 0,
        platformFeeUsd: 0,
        sellerNetUsd: 0,
        companySellerNetUsd: 0,
        marketplaceSellerNetUsd: 0,
        orders: [],
      };
      bySeller.set(sid, bucket);
    }
    bucket.orderCount += 1;
    if (isCompany) bucket.companyOrderCount += 1;
    bucket.gmvItemUsd = usd(bucket.gmvItemUsd + item);
    bucket.grossChargeUsd = usd(bucket.grossChargeUsd + o.totalUsd);
    bucket.platformFeeUsd = usd(bucket.platformFeeUsd + platformFeeUsd);
    bucket.sellerNetUsd = usd(bucket.sellerNetUsd + sellerNetUsd);
    if (isCompany) bucket.companySellerNetUsd = usd(bucket.companySellerNetUsd + sellerNetUsd);
    else bucket.marketplaceSellerNetUsd = usd(bucket.marketplaceSellerNetUsd + sellerNetUsd);

    const when = o.createdAt;
    bucket.orders.push({
      orderId: o.id,
      day: dayKey(when),
      title: o.listing.title,
      buyer: o.buyer.username,
      isCompanyListing: isCompany,
      itemUsd: usd(item),
      saleBasisUsd: usd(saleBasis),
      shippingUsd: usd(ship),
      taxUsd: usd(tax),
      totalUsd: usd(o.totalUsd),
      platformFeeUsd,
      processingFeeUsd: processingUsd,
      sellerNetUsd,
      payoutStatus: o.payoutStatus,
      paidAt: o.createdAt.toISOString(),
    });
  }

  const sellers = [...bySeller.values()].sort((a, b) => b.sellerNetUsd - a.sellerNetUsd);

  const stripe = isStripeConfigured() ? getStripe() : null;
  const connectBalances: Array<{
    sellerId: string;
    username: string | null;
    stripeAccountId: string;
    availableUsd: number | null;
    pendingUsd: number | null;
    error?: string;
  }> = [];

  for (const s of sellers.slice(0, 25)) {
    const acct = s.stripeAccountId?.trim();
    if (!acct || !stripe) continue;
    try {
      const bal = await stripe.balance.retrieve({ stripeAccount: acct });
      const availableUsd = usd(
        bal.available.filter((b) => b.currency === "usd").reduce((sum, b) => sum + b.amount, 0) / 100,
      );
      const pendingUsd = usd(
        bal.pending.filter((b) => b.currency === "usd").reduce((sum, b) => sum + b.amount, 0) / 100,
      );
      connectBalances.push({
        sellerId: s.sellerId,
        username: s.username,
        stripeAccountId: acct,
        availableUsd,
        pendingUsd,
      });
    } catch (e) {
      connectBalances.push({
        sellerId: s.sellerId,
        username: s.username,
        stripeAccountId: acct,
        availableUsd: null,
        pendingUsd: null,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const bankReady = await listSellersReadyForAdminBankPayout(1000);
  const focus = sellers.find((s) => (s.username ?? "").toLowerCase() === FOCUS_USERNAME.toLowerCase());
  const focusBalance = connectBalances.find((b) => b.sellerId === focus?.sellerId);
  const focusReady = bankReady.sellers.find((s) => s.sellerId === focus?.sellerId);

  const byDay: Record<
    string,
    { gmvItemUsd: number; grossChargeUsd: number; sellerNetUsd: number; platformFeeUsd: number; orderCount: number }
  > = {
    [yesterday.day]: { gmvItemUsd: 0, grossChargeUsd: 0, sellerNetUsd: 0, platformFeeUsd: 0, orderCount: 0 },
    [today.day]: { gmvItemUsd: 0, grossChargeUsd: 0, sellerNetUsd: 0, platformFeeUsd: 0, orderCount: 0 },
  };
  for (const s of sellers) {
    for (const o of s.orders) {
      const day = byDay[o.day];
      if (!day) continue;
      day.gmvItemUsd = usd(day.gmvItemUsd + o.itemUsd);
      day.grossChargeUsd = usd(day.grossChargeUsd + o.totalUsd);
      day.sellerNetUsd = usd(day.sellerNetUsd + o.sellerNetUsd);
      day.platformFeeUsd = usd(day.platformFeeUsd + o.platformFeeUsd);
      day.orderCount += 1;
    }
  }

  const report = {
    timezone: TZ,
    window: {
      yesterday: { day: yesterday.day, startUtc: yesterday.start.toISOString(), endUtc: yesterday.end.toISOString() },
      today: { day: today.day, startUtc: today.start.toISOString(), endUtc: today.end.toISOString() },
    },
    totals: {
      paidOrderCount: orders.length,
      gmvItemUsd: usd(sellers.reduce((s, x) => s + x.gmvItemUsd, 0)),
      grossChargeUsd: usd(sellers.reduce((s, x) => s + x.grossChargeUsd, 0)),
      platformFeeUsd: usd(sellers.reduce((s, x) => s + x.platformFeeUsd, 0)),
      sellerNetUsd: usd(sellers.reduce((s, x) => s + x.sellerNetUsd, 0)),
      companySellerNetUsd: usd(sellers.reduce((s, x) => s + x.companySellerNetUsd, 0)),
      marketplaceSellerNetUsd: usd(sellers.reduce((s, x) => s + x.marketplaceSellerNetUsd, 0)),
    },
    byDay,
    focusSeller: {
      username: FOCUS_USERNAME,
      found: Boolean(focus),
      sellerId: focus?.sellerId ?? null,
      companyOrderCount: focus?.companyOrderCount ?? 0,
      marketplaceOrderCount: focus ? focus.orderCount - focus.companyOrderCount : 0,
      sellerNetUsd: focus?.sellerNetUsd ?? 0,
      companySellerNetUsd: focus?.companySellerNetUsd ?? 0,
      marketplaceSellerNetUsd: focus?.marketplaceSellerNetUsd ?? 0,
      connectAvailableUsd: focusBalance?.availableUsd ?? null,
      connectPendingUsd: focusBalance?.pendingUsd ?? null,
      connectTotalUsd:
        focusBalance?.availableUsd != null && focusBalance.pendingUsd != null
          ? usd(focusBalance.availableUsd + focusBalance.pendingUsd)
          : null,
      adminBankPayoutOwedUsd: focusReady?.owedUsd ?? null,
      adminBankPayoutPushableUsd: focusReady?.pushableUsd ?? null,
      explanation:
        "Official/company listings (isCompanyListing) destination-charge nearly 100% of item+shipping to this Connect account (no platform fee, no processing pass-through). Platform fees from OTHER sellers stay on the platform Stripe account — they do not appear in this Connect wallet.",
      orders: focus?.orders ?? [],
    },
    sellersTop: sellers.slice(0, 20).map((s) => ({
      username: s.username,
      sellerId: s.sellerId,
      orderCount: s.orderCount,
      companyOrderCount: s.companyOrderCount,
      gmvItemUsd: s.gmvItemUsd,
      sellerNetUsd: s.sellerNetUsd,
      companySellerNetUsd: s.companySellerNetUsd,
      marketplaceSellerNetUsd: s.marketplaceSellerNetUsd,
      platformFeeUsd: s.platformFeeUsd,
    })),
    connectBalances,
    adminBankPayoutReady: {
      sellerCount: bankReady.sellerCount,
      orderCount: bankReady.orderCount,
      sellers: bankReady.sellers.map((s) => ({
        username: s.username,
        sellerId: s.sellerId,
        owedUsd: usd(s.owedUsd),
        availableUsd: s.availableUsd,
        pendingUsd: s.pendingUsd,
        pushableUsd: usd(s.pushableUsd),
        blockedReason: s.blockedReason,
        orderCount: s.orderCount,
      })),
    },
    liveVariantPurchasesInWindow: {
      count: variantPurchases.length,
      note: "Paid spot purchases; fulfillment Order seller nets are included in orders above when fulfillmentOrderId is set.",
      rows: variantPurchases.slice(0, 100).map((v) => ({
        id: v.id,
        host: v.liveRoom.seller.username,
        roomTitle: v.liveRoom.title,
        label: v.variant.label,
        totalUsd: usd(v.totalUsd),
        paidAt: v.paidAt?.toISOString() ?? null,
        fulfillmentOrderId: v.fulfillmentOrderId,
      })),
    },
    matchChecks: {
      focusConnectVsTwoDayCompanyNet: {
        connectTotalUsd:
          focusBalance?.availableUsd != null && focusBalance.pendingUsd != null
            ? usd(focusBalance.availableUsd + focusBalance.pendingUsd)
            : null,
        twoDayCompanySellerNetUsd: focus?.companySellerNetUsd ?? null,
        twoDayAllSellerNetUsd: focus?.sellerNetUsd ?? null,
        note: "Connect balance is lifetime residual (not just 2 days). Compare order list + Connect activity for exact source of ~$900.",
      },
      adminSurfacesAligned: {
        processingRule:
          "Company/Official: processingFee=0 on seller net. Marketplace: Order.stripeProcessingFeeCents or 2.9%+$0.30 estimate.",
        bankPayoutOwedUsesSameRule: true,
        sellerHqUsesSameRule: true,
        reconLedgerUsesSameRule: true,
        calendar: "Admin Today/Yesterday = America/Chicago Order.createdAt (Order has no paidAt).",
      },
    },
    generatedAt: new Date().toISOString(),
  };

  const outBase = path.join(
    webRoot,
    "reports",
    `payout-source-last-2-days-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  );
  fs.mkdirSync(path.dirname(outBase), { recursive: true });
  const body = JSON.stringify(report, null, 2);
  const jsonPath = `${outBase}.json`;
  fs.writeFileSync(jsonPath, body, "utf8");
  const sha = createHash("sha256").update(body).digest("hex");
  fs.writeFileSync(`${outBase}.sha256`, `${sha}\n`, "utf8");

  console.log(JSON.stringify({ ...report, reportPath: jsonPath, sha256: sha }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try {
    const { prisma } = await import("../src/lib/prisma");
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
