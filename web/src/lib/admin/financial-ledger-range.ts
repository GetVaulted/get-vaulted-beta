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

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function resolveLedgerDateRange(args: {
  range?: string | null;
  from?: string | null;
  to?: string | null;
  now?: Date;
}): LedgerDateRange {
  const now = args.now ?? new Date();
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
    const start = startOfUtcDay(now);
    return { rangeKey: "today", rangeStart: start, rangeEnd: null };
  }

  if (raw === "yesterday") {
    const today = startOfUtcDay(now);
    const start = new Date(today.getTime() - 24 * 3600_000);
    return { rangeKey: "yesterday", rangeStart: start, rangeEnd: today };
  }

  if (raw === "mtd") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { rangeKey: "mtd", rangeStart: start, rangeEnd: null };
  }

  if (raw === "prev_month") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { rangeKey: "prev_month", rangeStart: start, rangeEnd: end };
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
