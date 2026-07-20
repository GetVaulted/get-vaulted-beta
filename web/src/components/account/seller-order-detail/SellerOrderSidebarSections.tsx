import type { ReactNode } from "react";

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function formatMoneyCents(cents: number) {
  return formatMoney(cents / 100);
}

function formatPayoutStatus(status: string) {
  const key = status.trim().toLowerCase();
  if (key === "held" || key === "pending") return "Hold";
  if (key === "paid_out") return "Paid out";
  return status.replace(/_/g, " ");
}

export type SellerOrderShippingBreakdownProps = {
  buyerShippingCollectedCents: number;
  actualLabelCostCents: number | null;
  labelRefundOrCreditCents: number;
  netShippingImpactCents: number;
  labelStatus: string;
  carrier: string | null;
  service: string | null;
  trackingNumber: string | null;
  purchasedAt: string | null;
};

export type SellerOrderSidebarProps = {
  shipRecipientName: string;
  shipAddress: string;
  shipCity: string;
  shipState: string;
  shipZip: string;
  shipCountry: string;
  buyerUsername: string | null;
  itemPriceUsd: number;
  shippingPriceUsd: number;
  taxUsd: number;
  totalUsd: number;
  platformFeeEstimateUsd: number;
  platformFeePercent?: number;
  stripeProcessingFeeEstimateUsd: number;
  payoutEstimateUsd: number;
  payoutStatus: string;
  shippingAddressIncomplete?: boolean;
  shippingBreakdown?: SellerOrderShippingBreakdownProps | null;
  /** @deprecated use shippingBreakdown — kept for callers mid-migration */
  shippingLabelCostCents?: number | null;
  shippingLabelCostReversedCents?: number | null;
};

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">{title}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function MoneyRow({ label, value, strong, accent }: { label: string; value: string; strong?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-zinc-500">{label}</span>
      <span
        className={`font-mono tabular-nums ${strong ? "font-bold" : "font-medium"} ${accent ? "text-gold-bright" : "text-zinc-200"}`}
      >
        {value}
      </span>
    </div>
  );
}

function formatLabelStatus(status: string): string {
  switch (status) {
    case "purchased":
      return "Purchased";
    case "failed":
      return "Label purchase failed";
    case "refunded":
      return "Refunded";
    case "voided":
      return "Voided";
    case "quoted":
      return "Quoted";
    default:
      return "Pending";
  }
}

function actualLabelCostDisplay(breakdown: SellerOrderShippingBreakdownProps): string {
  if (breakdown.labelStatus === "failed") return formatMoney(0);
  if (breakdown.actualLabelCostCents == null) return "Pending";
  return `−${formatMoneyCents(breakdown.actualLabelCostCents)}`;
}

export function SellerOrderSidebarSections(props: SellerOrderSidebarProps) {
  const feePct =
    props.platformFeePercent != null && Number.isFinite(props.platformFeePercent)
      ? ` (${props.platformFeePercent}%)`
      : "";

  const breakdown = props.shippingBreakdown ?? null;
  const legacyLabelCents =
    props.shippingLabelCostReversedCents ?? props.shippingLabelCostCents ?? 0;

  return (
    <div className="space-y-3">
      <Panel title="Ship to">
        {props.shippingAddressIncomplete ? (
          <p className="mb-3 rounded-lg border border-rose-500/25 bg-rose-950/20 px-3 py-2 text-xs text-rose-100">
            Address on file is incomplete. Ask {props.buyerUsername ? `@${props.buyerUsername}` : "the buyer"} to
            update Wallet before you can ship.
          </p>
        ) : null}
        <p className="text-sm font-semibold text-zinc-100">{props.shipRecipientName || "—"}</p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          {props.shipAddress}
          <br />
          {[props.shipCity, props.shipState, props.shipZip].filter(Boolean).join(", ") || "—"}
          <br />
          {props.shipCountry || "—"}
        </p>
      </Panel>

      <Panel title="Buyer">
        <p className="text-sm font-semibold text-zinc-100">
          {props.buyerUsername ? `@${props.buyerUsername}` : "Buyer on file"}
        </p>
        <p className="mt-1 text-xs text-zinc-500">Ship this order to the buyer address above.</p>
      </Panel>

      <Panel title="Order totals">
        <div className="space-y-2">
          <MoneyRow label="Item" value={formatMoney(props.itemPriceUsd)} />
          <MoneyRow label="Shipping" value={formatMoney(props.shippingPriceUsd)} />
          {props.taxUsd > 0 ? <MoneyRow label="Tax" value={formatMoney(props.taxUsd)} /> : null}
          <div className="my-2 border-t border-white/[0.06]" />
          <MoneyRow label="Order total" value={formatMoney(props.totalUsd)} strong />
        </div>
      </Panel>

      <Panel title="Shipping">
        <div className="space-y-2">
          {breakdown ? (
            <>
              <MoneyRow
                label="Buyer shipping collected"
                value={formatMoneyCents(breakdown.buyerShippingCollectedCents)}
              />
              <MoneyRow label="Actual label cost" value={actualLabelCostDisplay(breakdown)} />
              {breakdown.labelRefundOrCreditCents > 0 ? (
                <MoneyRow
                  label="Label refund or credit"
                  value={formatMoneyCents(breakdown.labelRefundOrCreditCents)}
                />
              ) : null}
              <div className="my-2 border-t border-white/[0.06]" />
              <MoneyRow
                label="Net shipping impact"
                value={formatMoneyCents(breakdown.netShippingImpactCents)}
                strong
              />
              <p className="pt-1 text-xs text-zinc-500">
                Status: <span className="font-semibold text-zinc-300">{formatLabelStatus(breakdown.labelStatus)}</span>
                {breakdown.carrier || breakdown.service
                  ? ` · ${[breakdown.carrier, breakdown.service].filter(Boolean).join(" ")}`
                  : ""}
                {breakdown.trackingNumber ? ` · ${breakdown.trackingNumber}` : ""}
              </p>
            </>
          ) : (
            <>
              <MoneyRow label="Buyer shipping collected" value={formatMoney(props.shippingPriceUsd)} />
              <MoneyRow
                label="Actual label cost"
                value={legacyLabelCents > 0 ? `−${formatMoney(legacyLabelCents / 100)}` : "Pending"}
              />
            </>
          )}
        </div>
      </Panel>

      <Panel title="Your payout">
        <div className="space-y-2">
          <MoneyRow label={`Get Vaulted fee${feePct}`} value={`−${formatMoney(props.platformFeeEstimateUsd)}`} />
          <MoneyRow label="Stripe fee" value={`−${formatMoney(props.stripeProcessingFeeEstimateUsd)}`} />
          <div className="my-2 border-t border-white/[0.06]" />
          <MoneyRow label="Est. payout" value={formatMoney(props.payoutEstimateUsd)} strong accent />
          <p className="pt-1 text-xs text-zinc-500">
            Status: <span className="font-semibold text-zinc-300">{formatPayoutStatus(props.payoutStatus)}</span>
            {" · "}
            Get Vaulted fee is the platform fee on item price only. Shipping label cost is shown under Shipping and is
            not part of the Get Vaulted fee. 3-day hold after delivery.
          </p>
        </div>
      </Panel>
    </div>
  );
}
