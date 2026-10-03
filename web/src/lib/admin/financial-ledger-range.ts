import type { Prisma } from "@/generated/prisma/client";
import {
  addCalendarDays,
  calendarDayBoundsUtc,
  calendarDayInTimeZone,
} from "@/lib/calendar-day-bounds";

export type LedgerRangeKey =
  | "today"
  | "yesterday"
  | "7d"
  | "mtd"
  | "prev_month"
  | "30d"
  | "90d"
  | "all"
  | "custom";

/** Legacy reconciliation keys still accepted by older endpoints. */
export type LegacyReconciliationRangeKey = "24h" | "7d" | "30d" | "90d" | "all";

export type LedgerDateRange = {
  rangeKey: LedgerRangeKey;
  rangeStart: Date | null;
  rangeEnd: Date | null;
};

/** Admin Today/Yesterday/MTD use US business calendar (same as Seller HQ default). */
export const ADMIN_LEDGER_TIMEZONE = "America/Chicago";

export function resolveLedgerDateRange(args: {
  range?: string | null;
  from?: string | null;
  to?: string | null;
  now?: Date;
  timeZone?: string;
}): LedgerDateRange {
  const now = args.now ?? new Date();
  const timeZone = args.timeZone ?? ADMIN_LEDGER_TIMEZONE;
  const raw = (args.range ?? "30d").trim().toLowerCase();

  if (raw === "custom") {
    const from = args.from ? new Date(args.from) : null;
    const to = args.to ? new Date(args.to) : null;
    return {
      rangeKey: "custom",
      rangeStart: from && !Number.isNaN(from.getTime()) ? from : null,
      rangeEnd: to && !Number.isNaN(to.getTime()) ? to : null,
    };
  }

  if (raw === "today") {
    const todayYmd = calendarDayInTimeZone(now, timeZone);
    const { start } = calendarDayBoundsUtc(todayYmd, timeZone);
    return { rangeKey: "today", rangeStart: start, rangeEnd: null };
  }

  if (raw === "yesterday") {
    const todayYmd = calendarDayInTimeZone(now, timeZone);
    const yesterdayYmd = addCalendarDays(todayYmd, -1);
    const { start } = calendarDayBoundsUtc(yesterdayYmd, timeZone);
    const { start: todayStart } = calendarDayBoundsUtc(todayYmd, timeZone);
    return {
      rangeKey: "yesterday",
      rangeStart: start,
      rangeEnd: todayStart,
    };
  }

  if (raw === "mtd") {
    const todayYmd = calendarDayInTimeZone(now, timeZone);
    const monthStartYmd = `${todayYmd.slice(0, 8)}01`;
    const { start } = calendarDayBoundsUtc(monthStartYmd, timeZone);
    return { rangeKey: "mtd", rangeStart: start, rangeEnd: null };
  }

  if (raw === "prev_month") {
    const todayYmd = calendarDayInTimeZone(now, timeZone);
    const thisMonthStartYmd = `${todayYmd.slice(0, 8)}01`;
    const { start: thisMonthStart } = calendarDayBoundsUtc(thisMonthStartYmd, timeZone);
    const insidePrev = new Date(thisMonthStart.getTime() - 12 * 3600_000);
    const prevMonthYmd = calendarDayInTimeZone(insidePrev, timeZone);
    const prevMonthStartYmd = `${prevMonthYmd.slice(0, 8)}01`;
    const { start: prevMonthStart } = calendarDayBoundsUtc(prevMonthStartYmd, timeZone);
    return {
      rangeKey: "prev_month",
      rangeStart: prevMonthStart,
      rangeEnd: thisMonthStart,
    };
  }

  if (raw === "24h") {
    return { rangeKey: "7d", rangeStart: new Date(now.getTime() - 24 * 3600_000), rangeEnd: null };
  }
  if (raw === "7d") {
    return { rangeKey: "7d", rangeStart: new Date(now.getTime() - 7 * 86400_000), rangeEnd: null };
  }
  if (raw === "90d") {
    return { rangeKey: "90d", rangeStart: new Date(now.getTime() - 90 * 86400_000), rangeEnd: null };
  }
  if (raw === "all") {
    return { rangeKey: "all", rangeStart: null, rangeEnd: null };
  }

  // default 30d (also maps legacy "30d")
  return { rangeKey: "30d", rangeStart: new Date(now.getTime() - 30 * 86400_000), rangeEnd: null };
}

/** Map ledger range → legacy key for existing Stripe/shipping loaders. */
export function ledgerRangeToLegacy(
  rangeKey: LedgerRangeKey,
): "24h" | "7d" | "30d" | "90d" | "all" {
  switch (rangeKey) {
    case "today":
    case "yesterday":
      return "24h";
    case "7d":
      return "7d";
    case "mtd":
    case "prev_month":
    case "30d":
    case "custom":
      return "30d";
    case "90d":
      return "90d";
    case "all":
      return "all";
  }
}

export function prismaCreatedAtFilter(range: LedgerDateRange): { createdAt?: { gte?: Date; lt?: Date } } {
  if (!range.rangeStart && !range.rangeEnd) return {};
  const createdAt: { gte?: Date; lt?: Date } = {};
  if (range.rangeStart) createdAt.gte = range.rangeStart;
  if (range.rangeEnd) createdAt.lt = range.rangeEnd;
  return { createdAt };
}

/**
 * Order sale window filter — the payment-date basis for financial reconciliation.
 *
 * `Order.paidAt` is the actual Stripe charge.created (or equivalent confirmation moment for
 * escrow/layaway/giveaway orders) — see the financial reconciliation audit, bug #1. Falls back to
 * `createdAt` only for orders not yet backfilled (paidAt still null): every order that has ever
 * reached a paid-bucket status gets paidAt set synchronously at that moment, so this fallback
 * branch only matters for historical rows awaiting the backfill job, never for new orders.
 */
export function prismaSaleAtFilter(range: LedgerDateRange): Prisma.OrderWhereInput {
  if (!range.rangeStart && !range.rangeEnd) return {};
  const paidAt: { gte?: Date; lt?: Date } = {};
  if (range.rangeStart) paidAt.gte = range.rangeStart;
  if (range.rangeEnd) paidAt.lt = range.rangeEnd;
  const createdAt: { gte?: Date; lt?: Date } = {};
  if (range.rangeStart) createdAt.gte = range.rangeStart;
  if (range.rangeEnd) createdAt.lt = range.rangeEnd;
  return {
    OR: [{ paidAt }, { AND: [{ paidAt: null }, { createdAt }] }],
  };
}
