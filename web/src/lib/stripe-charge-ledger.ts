import type Stripe from "stripe";
import { moneyFlowLog } from "@/lib/money-flow-log";
import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export type StripeChargeLedgerSnapshot = {
  stripeChargeId: string | null;
  stripeBalanceTransactionId: string | null;
  stripeProcessingFeeCents: number | null;
  stripeApplicationFeeCents: number | null;
  stripeTransferId: string | null;
  stripeNetCents: number | null;
};

function asExpanded<T extends object>(value: string | T | null | undefined): T | null {
  if (!value || typeof value === "string") return null;
  return value;
}

/** Extract ledger fields from an expanded PaymentIntent (latest_charge + BT + app fee + transfer). */
export function extractChargeLedgerFromPaymentIntent(
  pi: Stripe.PaymentIntent,
): StripeChargeLedgerSnapshot {
  const charge = asExpanded<Stripe.Charge>(pi.latest_charge);
  if (!charge) {
    return {
      stripeChargeId: typeof pi.latest_charge === "string" ? pi.latest_charge : null,
      stripeBalanceTransactionId: null,
      stripeProcessingFeeCents: null,
      stripeApplicationFeeCents: null,
      stripeTransferId: null,
      stripeNetCents: null,
    };
  }

  const bt = asExpanded<Stripe.BalanceTransaction>(charge.balance_transaction);
  const appFee = asExpanded<Stripe.ApplicationFee>(charge.application_fee);
  const transfer = asExpanded<Stripe.Transfer>(
    (charge as Stripe.Charge & { transfer?: string | Stripe.Transfer | null }).transfer ?? null,
  );

  const transferId =
    transfer?.id ??
    (typeof (charge as { transfer?: string | null }).transfer === "string"
      ? (charge as { transfer: string }).transfer
      : null) ??
    (charge.transfer_data?.destination
      ? null
      : null);

  return {
    stripeChargeId: charge.id,
    stripeBalanceTransactionId: bt?.id ?? (typeof charge.balance_transaction === "string" ? charge.balance_transaction : null),
    stripeProcessingFeeCents: bt != null ? Math.max(0, bt.fee) : null,
    stripeApplicationFeeCents:
      appFee != null
        ? Math.max(0, appFee.amount)
        : charge.application_fee_amount != null
          ? Math.max(0, charge.application_fee_amount)
          : null,
    stripeTransferId: transferId,
    stripeNetCents: bt != null ? bt.net : null,
  };
}

export async function loadPaymentIntentChargeLedger(
  paymentIntentId: string,
): Promise<StripeChargeLedgerSnapshot | null> {
  if (!paymentIntentId.trim() || !isStripeConfigured()) return null;
  try {
    const stripe = getStripe();
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: [
        "latest_charge.balance_transaction",
        "latest_charge.application_fee",
        "latest_charge.transfer",
      ],
    });
    moneyFlowLog("stripe_balance_transaction_loaded", {
      paymentIntentId,
      latestCharge: typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id,
    });
    const snap = extractChargeLedgerFromPaymentIntent(pi);
    if (snap.stripeProcessingFeeCents != null) {
      moneyFlowLog("processing_fee_recorded", {
        paymentIntentId,
        stripeProcessingFeeCents: snap.stripeProcessingFeeCents,
      });
    }
    if (snap.stripeApplicationFeeCents != null) {
      moneyFlowLog("application_fee_recorded", {
        paymentIntentId,
        stripeApplicationFeeCents: snap.stripeApplicationFeeCents,
      });
    }
    if (snap.stripeTransferId) {
      moneyFlowLog("transfer_created", {
        paymentIntentId,
        stripeTransferId: snap.stripeTransferId,
      });
    }
    return snap;
  } catch (e) {
    console.error("[stripe-charge-ledger] load failed", paymentIntentId, e);
    return null;
  }
}

/**
 * Persist Stripe charge / BT fee fields on an order. Only fills null columns unless `force`.
 * Does not overwrite non-null values without force (safe for backfill + finalize races).
 */
export async function persistOrderStripeChargeLedger(args: {
  orderId: string;
  paymentIntentId: string | null | undefined;
  force?: boolean;
}): Promise<StripeChargeLedgerSnapshot | null> {
  if (!args.paymentIntentId?.trim()) return null;
  const snap = await loadPaymentIntentChargeLedger(args.paymentIntentId);
  if (!snap) return null;

  const existing = await prisma.order.findUnique({
    where: { id: args.orderId },
    select: {
      stripeChargeId: true,
      stripeBalanceTransactionId: true,
      stripeProcessingFeeCents: true,
      stripeApplicationFeeCents: true,
      stripeTransferId: true,
      stripeNetCents: true,
    },
  });
  if (!existing) return snap;

  const force = args.force === true;
  const data: Record<string, string | number> = {};
  if (snap.stripeChargeId && (force || !existing.stripeChargeId)) {
    data.stripeChargeId = snap.stripeChargeId;
  }
  if (snap.stripeBalanceTransactionId && (force || !existing.stripeBalanceTransactionId)) {
    data.stripeBalanceTransactionId = snap.stripeBalanceTransactionId;
  }
  if (snap.stripeProcessingFeeCents != null && (force || existing.stripeProcessingFeeCents == null)) {
    data.stripeProcessingFeeCents = snap.stripeProcessingFeeCents;
  }
  if (snap.stripeApplicationFeeCents != null && (force || existing.stripeApplicationFeeCents == null)) {
    data.stripeApplicationFeeCents = snap.stripeApplicationFeeCents;
  }
  if (snap.stripeTransferId && (force || !existing.stripeTransferId)) {
    data.stripeTransferId = snap.stripeTransferId;
  }
  if (snap.stripeNetCents != null && (force || existing.stripeNetCents == null)) {
    data.stripeNetCents = snap.stripeNetCents;
  }

  if (Object.keys(data).length > 0) {
    await prisma.order.update({ where: { id: args.orderId }, data });
    moneyFlowLog("charge_succeeded", { orderId: args.orderId, ...data });
  }
  return snap;
}
