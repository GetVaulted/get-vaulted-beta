"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  AdminStatusPill,
  adminButtonPrimaryClassName,
  adminPanelClassName,
  formatAdminUsd,
} from "@/components/admin/AdminCommandShell";

function moneyCents(cents: number | null | undefined) {
  if (cents == null) return "—";
  return formatAdminUsd(cents / 100);
}

function SourceBadge({ source }: { source?: string }) {
  if (source === "actual") return <AdminStatusPill tone="ok">Actual</AdminStatusPill>;
  if (source === "estimated") return <AdminStatusPill tone="warn">Estimated</AdminStatusPill>;
  if (source === "derived") return <AdminStatusPill tone="neutral">Derived</AdminStatusPill>;
  return null;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={`${adminPanelClassName} p-4`}>
      <h3 className="font-display text-xs font-bold uppercase tracking-wide text-zinc-400">{title}</h3>
      <div className="mt-3 space-y-1.5 text-[11px] text-zinc-300">{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
  source,
  mono = true,
}: {
  label: string;
  value: ReactNode;
  source?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/[0.04] py-1.5 last:border-0">
      <span className="text-zinc-500">{label}</span>
      <span className={`text-right ${mono ? "font-mono" : ""}`}>
        {value} {source ? <SourceBadge source={source} /> : null}
      </span>
    </div>
  );
}

export type OrderLedgerDrawerProps = {
  order: any | null;
  open: boolean;
  onClose: () => void;
  onRetryLabelCost?: (orderId: string) => void;
  retryBusy?: boolean;
};

/** Full financial ledger slide-over — buyer / Stripe / seller / platform / shipping / tax / refunds. */
export function AdminOrderLedgerDrawer({
  order,
  open,
  onClose,
  onRetryLabelCost,
  retryBusy,
}: OrderLedgerDrawerProps) {
  if (!open || !order) return null;

  const r = order;
  const needsLabelRetry =
    (r.actualLabelCostCents?.cents ?? 0) > 0 &&
    r.sellerLabelDeductionCents !== r.actualLabelCostCents?.cents;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-2xl flex-col border-l border-white/10 bg-[#070709] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-white/[0.08] px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold/70">Order ledger</p>
            <h2 className="mt-1 truncate font-mono text-sm text-zinc-100">{r.orderId}</h2>
            <p className="mt-1 truncate text-xs text-zinc-500">{r.listingTitle}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {r.everythingReconciled ? (
                <AdminStatusPill tone="ok">Reconciled</AdminStatusPill>
              ) : (
                <AdminStatusPill tone={r.reconciliationStatus === "exception" ? "bad" : "warn"}>
                  {r.reconciliationStatus}
                </AdminStatusPill>
              )}
              <AdminStatusPill tone="neutral">{r.purchaseType}</AdminStatusPill>
              <AdminStatusPill tone="neutral">{r.paymentStatus}</AdminStatusPill>
              <AdminStatusPill tone="neutral">{r.payoutStatus}</AdminStatusPill>
            </div>
          </div>
          <button type="button" className={adminButtonPrimaryClassName} onClick={onClose}>
            Close
          </button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <Section title="Buyer">
            <Row label="Item subtotal" value={moneyCents(r.itemSubtotalCents)} />
            <Row label="Shipping charged" value={moneyCents(r.buyerShippingCents)} />
            <Row label="Sales tax" value={moneyCents(r.salesTaxCents)} />
            <Row label="Discount / credit" value={moneyCents(r.discountCents)} />
            <Row label="Total charged" value={moneyCents(r.customerTotalCents)} />
            <Row label="Amount refunded" value={moneyCents(r.amountRefundedCents)} />
            <Row label="Final buyer paid" value={moneyCents(r.finalBuyerPaidCents)} />
            <Row
              label="Buyer / seller"
              value={`@${r.buyerUsername ?? "—"} → @${r.sellerUsername ?? "—"}`}
              mono={false}
            />
          </Section>

          <Section title="Stripe">
            <Row label="PaymentIntent" value={r.stripePaymentIntentId ?? "—"} />
            <Row label="Charge" value={r.stripeChargeId ?? "—"} />
            <Row label="Balance transaction" value={r.stripeBalanceTransactionId ?? "—"} />
            <Row
              label="Processing fee"
              value={moneyCents(r.stripeProcessingFeeCents?.cents)}
              source={r.stripeProcessingFeeCents?.source}
            />
            <Row label="Stripe net" value={moneyCents(r.sections?.stripe?.stripeNetCents)} />
            <Row label="Transfer ID" value={r.stripeTransferId ?? "—"} />
            <Row
              label="Transfer amount"
              value={moneyCents(r.sellerTransferCents?.cents)}
              source={r.sellerTransferCents?.source}
            />
            <Row label="Transfer reversal (label)" value={r.shippingLabelCostReversalId ?? "—"} />
            <Row
              label="Stripe application_fee_amount"
              value={moneyCents(r.sections?.stripe?.stripeApplicationFeeAmountCents)}
            />
            <Row label="Tax calculation ID" value={r.stripeTaxCalculationId ?? "—"} />
            <Row label="Tax transaction ID" value={r.stripeTaxTransactionId ?? "—"} />
          </Section>

          <Section title="Seller">
            <Row label="Seller gross (item + ship)" value={moneyCents(r.itemSubtotalCents + r.buyerShippingCents)} />
            <Row
              label="Platform fee charged"
              value={moneyCents(r.platformFeeCents?.cents)}
              source={r.platformFeeCents?.source}
            />
            <Row label="Fee rate" value={`${r.platformFeePercent}%`} />
            <Row
              label="Seller-paid processing"
              value={moneyCents(r.stripeProcessingFeeCents?.cents)}
              source={r.stripeProcessingFeeCents?.source}
            />
            <Row label="Buyer shipping credited" value={moneyCents(r.buyerShippingCents)} />
            <Row
              label="Original transfer"
              value={moneyCents(r.sellerTransferCents?.cents)}
              source={r.sellerTransferCents?.source}
            />
            <Row label="Label-cost deduction" value={moneyCents(r.sellerLabelDeductionCents)} />
            <Row
              label="Final seller proceeds"
              value={moneyCents(r.sellerFinalNetCents?.cents)}
              source={r.sellerFinalNetCents?.source}
            />
            <Row label="Payout status" value={r.payoutStatus} mono={false} />
          </Section>

          <Section title="Platform">
            <Row label="Platform fee earned (revenue)" value={moneyCents(r.platformEarnedRevenueCents)} />
            <Row label="Sales tax held (liability)" value={moneyCents(r.platformHeldTaxCents)} />
            <Row
              label="Cash retained before processing"
              value={moneyCents(r.platformCashBeforeProcessingCents?.cents)}
              source={r.platformCashBeforeProcessingCents?.source}
            />
            <Row
              label="Cash after processing"
              value={moneyCents(r.platformCashAfterProcessingCents?.cents)}
              source={r.platformCashAfterProcessingCents?.source}
            />
            <Row
              label="Shippo label cost paid"
              value={moneyCents(r.actualLabelCostCents?.cents)}
              source={r.actualLabelCostCents?.source}
            />
            <Row label="Label reimbursement from seller" value={moneyCents(r.sellerLabelDeductionCents)} />
            <Row label="Platform shipping variance" value={moneyCents(r.platformShippingVarianceCents)} />
            <Row label="Dispute / chargeback loss" value={moneyCents(r.disputeLossCents)} />
            <Row label="Final variance" value={moneyCents(r.finalVarianceCents)} />
          </Section>

          <Section title="Shipping">
            <Row label="Buyer shipping collected" value={moneyCents(r.buyerShippingCents)} />
            <Row label="Estimated label cost" value={moneyCents(r.estimatedLabelCostCents)} />
            <Row
              label="Actual Shippo label cost"
              value={moneyCents(r.actualLabelCostCents?.cents)}
              source={r.actualLabelCostCents?.source}
            />
            <Row label="Shippo transaction" value={r.shippoTransactionId ?? "—"} />
            <Row label="Shippo shipment" value={r.shippoShipmentId ?? "—"} />
            <Row label="Tracking" value={r.trackingNumber ?? "—"} />
            <Row label="Seller deduction" value={moneyCents(r.sellerLabelDeductionCents)} />
            <Row label="Reversal ID" value={r.shippingLabelCostReversalId ?? "—"} />
            <Row label="Fulfillment" value={r.fulfillmentStatus} mono={false} />
            {needsLabelRetry && onRetryLabelCost ? (
              <button
                type="button"
                className={`${adminButtonPrimaryClassName} mt-2`}
                disabled={retryBusy}
                onClick={() => onRetryLabelCost(r.orderId)}
              >
                {retryBusy ? "Retrying…" : "Retry label-cost reversal"}
              </button>
            ) : null}
          </Section>

          <Section title="Tax">
            <Row label="Sales tax collected" value={moneyCents(r.salesTaxCents)} />
            <Row label="Tax held (liability)" value={moneyCents(r.platformHeldTaxCents)} />
            <Row label="Tax calculation ID" value={r.stripeTaxCalculationId ?? "—"} />
            <Row label="Tax transaction ID" value={r.stripeTaxTransactionId ?? "—"} />
            <p className="pt-1 text-[10px] text-zinc-600">
              Sales tax is a liability — never counted as platform revenue.
            </p>
          </Section>

          <Section title="Refunds & disputes">
            <Row label="Refund total" value={moneyCents(r.refundTotalCents)} />
            <Row label="Dispute loss" value={moneyCents(r.disputeLossCents)} />
            <Row label="Payment status" value={r.paymentStatus} mono={false} />
            <Row label="Final buyer paid" value={moneyCents(r.finalBuyerPaidCents)} />
          </Section>

          <Section title="Reconciliation">
            {r.everythingReconciled ? (
              <p className="text-sm text-emerald-300">Everything reconciled ✅</p>
            ) : (
              <div>
                <p className="text-sm text-rose-300">Variance: {moneyCents(r.finalVarianceCents)}</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-zinc-400">
                  {(r.varianceReasons ?? []).map((reason: string) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-3">
              <Link
                href={`/admin/orders/${encodeURIComponent(r.orderId)}`}
                className="text-xs font-semibold text-gold-bright hover:underline"
              >
                Open admin order page →
              </Link>
            </div>
          </Section>
        </div>
      </aside>
    </div>
  );
}
