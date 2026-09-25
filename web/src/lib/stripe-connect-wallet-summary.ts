import type Stripe from "stripe";

export type SellerWalletPayoutRow = {
  id: string;
  amountCents: number;
  amountFormatted: string;
  currency: string;
  /** Stripe payout status (`paid`, `pending`, `in_transit`, `failed`, …). */
  status: string;
  /** Short seller-facing status. */
  statusLabel: string;
  /** Where the money went / is going. */
  destinationLabel: string;
  arrivalDate: string | null;
  createdAt: string;
};

export type SellerWalletActivityRow = {
  id: string;
  /** Signed amount in cents (negative = left the Connect balance). */
  amountCents: number;
  amountFormatted: string;
  currency: string;
  type: string;
  /** Seller-facing explanation of the movement. */
  title: string;
  description: string;
  createdAt: string;
};

export type SellerWalletSummary = {
  stripeConfigured: boolean;
  hasStripeAccount: boolean;
  currency: string;
  availableCents: number;
  pendingCents: number;
  availableFormatted: string;
  pendingFormatted: string;
  /** ISO timestamp when the next bank deposit is expected, if known. */
  nextPayoutAt: string | null;
  nextPayoutLabel: string | null;
  payoutScheduleSummary: string | null;
  message: string | null;
  /** Recent bank payouts including sent (`paid`) ones. */
  recentPayouts: SellerWalletPayoutRow[];
  /**
   * Recent Connect balance movements (payouts, refunds, label clawbacks, etc.)
   * so sellers can see where deducted funds went.
   */
  recentActivity: SellerWalletActivityRow[];
};

function formatUsdFromCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatSignedUsdFromCents(cents: number): string {
  const abs = formatUsdFromCents(Math.abs(cents));
  if (cents < 0) return `−${abs}`;
  if (cents > 0) return `+${abs}`;
  return abs;
}

function sumForCurrency(
  entries: Array<{ amount: number; currency: string }> | undefined,
  currency: string,
): number {
  if (!entries?.length) return 0;
  return entries.filter((e) => e.currency.toLowerCase() === currency).reduce((s, e) => s + e.amount, 0);
}

function isoFromUnix(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;
  const d = new Date(seconds * 1000);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function describePayoutSchedule(
  schedule: Stripe.Account.Settings.Payouts.Schedule | null | undefined,
): string | null {
  if (!schedule?.interval) return null;
  const delay = schedule.delay_days ?? 0;
  const delayPart = delay > 0 ? ` · ${delay}-day rolling delay` : "";
  switch (schedule.interval) {
    case "manual":
      return `Manual payouts${delayPart} — Stripe holds funds until you request a payout`;
    case "daily":
      return `Automatic daily payouts${delayPart}`;
    case "weekly": {
      const anchor = schedule.weekly_anchor ? ` on ${schedule.weekly_anchor}` : "";
      return `Automatic weekly payouts${anchor}${delayPart}`;
    }
    case "monthly": {
      const day = schedule.monthly_anchor != null ? ` on day ${schedule.monthly_anchor}` : "";
      return `Automatic monthly payouts${day}${delayPart}`;
    }
    default:
      return `Automatic payouts (${schedule.interval})${delayPart}`;
  }
}

export function payoutStatusLabel(status: string): string {
  switch (status) {
    case "paid":
      return "Sent";
    case "in_transit":
      return "In transit";
    case "pending":
      return "Scheduled";
    case "failed":
      return "Failed";
    case "canceled":
      return "Canceled";
    default:
      return status.replace(/_/g, " ");
  }
}

export function payoutDestinationLabel(status: string): string {
  switch (status) {
    case "paid":
      return "Deposited to your linked bank account";
    case "in_transit":
      return "On the way to your linked bank account";
    case "pending":
      return "Will deposit to your linked bank account";
    case "failed":
      return "Could not reach your bank — check Stripe settings";
    case "canceled":
      return "Payout canceled";
    default:
      return "Bank payout";
  }
}

export function mapRecentPayouts(payouts: Stripe.Payout[], limit = 10): SellerWalletPayoutRow[] {
  return [...payouts]
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
    .slice(0, limit)
    .map((p) => {
      const status = String(p.status ?? "unknown");
      return {
        id: p.id,
        amountCents: p.amount,
        amountFormatted: formatUsdFromCents(p.amount),
        currency: (p.currency ?? "usd").toLowerCase(),
        status,
        statusLabel: payoutStatusLabel(status),
        destinationLabel: payoutDestinationLabel(status),
        arrivalDate: isoFromUnix(p.arrival_date),
        createdAt: isoFromUnix(p.created) ?? new Date(0).toISOString(),
      };
    });
}

/** Human-readable title/description for Connect balance transactions. */
export function describeBalanceTransaction(tx: {
  type: string;
  description?: string | null;
  reporting_category?: string | null;
  amount: number;
  source?: string | Stripe.BalanceTransactionSource | null;
}): { title: string; description: string } {
  const rawDesc = typeof tx.description === "string" ? tx.description.trim() : "";
  const type = (tx.type || "").toLowerCase();
  const reporting = (tx.reporting_category || "").toLowerCase();
  const outbound = tx.amount < 0;

  if (type === "payout" || reporting === "payout") {
    return {
      title: outbound ? "Payout to bank" : "Payout returned",
      description: outbound
        ? "Sent from your Stripe balance to your linked bank account."
        : rawDesc || "Payout returned to your Stripe balance.",
    };
  }

  if (type === "payment" || reporting === "charge") {
    return {
      title: "Sale received",
      description: rawDesc || "Payment from a sale landed in your Stripe balance.",
    };
  }

  if (type === "payment_refund" || reporting === "refund") {
    return {
      title: "Refund",
      description: rawDesc || "Funds returned to a buyer (deducted from your balance).",
    };
  }

  if (type === "transfer" || reporting === "transfer") {
    return {
      title: outbound ? "Balance transfer out" : "Balance transfer in",
      description:
        rawDesc ||
        (outbound
          ? "Transferred out of your Connect balance (often shipping label cost recovery)."
          : "Transferred into your Connect balance."),
    };
  }

  if (type === "adjustment" || reporting === "risk_reserved_funds" || reporting === "fee") {
    const looksLikeLabel =
      /label|shippo|shipping|clawback|postage/i.test(rawDesc) ||
      /label|shippo|shipping|clawback|postage/i.test(reporting);
    if (looksLikeLabel || (outbound && /reversal|claw/i.test(rawDesc))) {
      return {
        title: outbound ? "Shipping label cost" : "Shipping label credit",
        description:
          rawDesc ||
          (outbound
            ? "Deducted to cover postage / label cost Get Vaulted paid on your behalf."
            : "Credit related to a shipping label."),
      };
    }
    return {
      title: outbound ? "Balance deduction" : "Balance credit",
      description: rawDesc || "Stripe balance adjustment.",
    };
  }

  if (type === "stripe_fee" || reporting === "fee") {
    return {
      title: "Stripe fee",
      description: rawDesc || "Processing fee charged by Stripe.",
    };
  }

  if (outbound) {
    return {
      title: "Balance deduction",
      description: rawDesc || `Funds left your Stripe balance (${type || "adjustment"}).`,
    };
  }

  return {
    title: "Balance credit",
    description: rawDesc || `Funds added to your Stripe balance (${type || "credit"}).`,
  };
}

export function mapRecentBalanceActivity(
  transactions: Stripe.BalanceTransaction[],
  limit = 15,
): SellerWalletActivityRow[] {
  return [...transactions]
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
    .slice(0, limit)
    .map((tx) => {
      const { title, description } = describeBalanceTransaction(tx);
      return {
        id: tx.id,
        amountCents: tx.amount,
        amountFormatted: formatSignedUsdFromCents(tx.amount),
        currency: (tx.currency ?? "usd").toLowerCase(),
        type: tx.type,
        title,
        description,
        createdAt: isoFromUnix(tx.created) ?? new Date(0).toISOString(),
      };
    });
}

export function pickNextPayoutFromList(
  payouts: Stripe.Payout[],
): { at: Date; label: string } | null {
  const candidates = payouts
    .filter((p) => p.status === "pending" || p.status === "in_transit")
    .map((p) => ({
      at: new Date((p.arrival_date ?? 0) * 1000),
      amount: p.amount,
      currency: p.currency,
      status: p.status,
    }))
    .filter((p) => !Number.isNaN(p.at.getTime()))
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  const next = candidates[0];
  if (!next) return null;

  const when = next.at.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const amt = formatUsdFromCents(next.amount);
  const statusNote = next.status === "in_transit" ? "In transit · " : "";
  return {
    at: next.at,
    label: `${statusNote}${amt} expected ${when}`,
  };
}

export function buildSellerWalletSummary(args: {
  stripeConfigured: boolean;
  hasStripeAccount: boolean;
  balance: Stripe.Balance | null;
  payouts: Stripe.Payout[];
  balanceTransactions?: Stripe.BalanceTransaction[];
  payoutSchedule: Stripe.Account.Settings.Payouts.Schedule | null | undefined;
  currency?: string;
}): SellerWalletSummary {
  const currency = (args.currency ?? "usd").toLowerCase();
  const empty: SellerWalletSummary = {
    stripeConfigured: args.stripeConfigured,
    hasStripeAccount: args.hasStripeAccount,
    currency,
    availableCents: 0,
    pendingCents: 0,
    availableFormatted: formatUsdFromCents(0),
    pendingFormatted: formatUsdFromCents(0),
    nextPayoutAt: null,
    nextPayoutLabel: null,
    payoutScheduleSummary: null,
    message: null,
    recentPayouts: [],
    recentActivity: [],
  };

  if (!args.stripeConfigured) {
    return {
      ...empty,
      message: "Stripe is not configured in this environment.",
    };
  }

  if (!args.hasStripeAccount) {
    return {
      ...empty,
      message: "Complete payout setup to see balances and payout timing.",
    };
  }

  const availableCents = sumForCurrency(args.balance?.available, currency);
  const pendingCents = sumForCurrency(args.balance?.pending, currency);
  const scheduleSummary = describePayoutSchedule(args.payoutSchedule);
  const next = pickNextPayoutFromList(args.payouts);
  const recentPayouts = mapRecentPayouts(args.payouts);
  const recentActivity = mapRecentBalanceActivity(args.balanceTransactions ?? []);

  let nextPayoutAt: string | null = next ? next.at.toISOString() : null;
  let nextPayoutLabel: string | null = next?.label ?? null;
  let message: string | null = null;

  if (!nextPayoutLabel) {
    if (availableCents > 0 && args.payoutSchedule?.interval && args.payoutSchedule.interval !== "manual") {
      nextPayoutLabel = "Stripe pays out on your automatic schedule when funds are available";
      message = scheduleSummary;
    } else if (availableCents > 0 && args.payoutSchedule?.interval === "manual") {
      nextPayoutLabel = "No payout scheduled — request one in Stripe when ready";
      message = scheduleSummary;
    } else if (pendingCents > 0) {
      nextPayoutLabel = "Processing — Stripe will show a deposit date soon";
      message = scheduleSummary;
    } else {
      nextPayoutLabel = null;
      message = scheduleSummary ?? "Balances update as you make sales.";
    }
  } else {
    message = scheduleSummary;
  }

  return {
    stripeConfigured: true,
    hasStripeAccount: true,
    currency,
    availableCents,
    pendingCents,
    availableFormatted: formatUsdFromCents(availableCents),
    pendingFormatted: formatUsdFromCents(pendingCents),
    nextPayoutAt,
    nextPayoutLabel,
    payoutScheduleSummary: scheduleSummary,
    message,
    recentPayouts,
    recentActivity,
  };
}
