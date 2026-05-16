import type Stripe from "stripe";

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
};

function formatUsdFromCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function sumForCurrency(
  entries: Array<{ amount: number; currency: string }> | undefined,
  currency: string,
): number {
  if (!entries?.length) return 0;
  return entries.filter((e) => e.currency.toLowerCase() === currency).reduce((s, e) => s + e.amount, 0);
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
  payoutSchedule: Stripe.Account.Settings.Payouts.Schedule | null | undefined;
  currency?: string;
}): SellerWalletSummary {
  const currency = (args.currency ?? "usd").toLowerCase();
  const empty = {
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
  };
}
