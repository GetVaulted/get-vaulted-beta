import type { ReactNode } from "react";

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function formatPayoutStatus(status: string) {
  const key = status.trim().toLowerCase();
  if (key === "held" || key === "pending") return "Hold";
  if (key === "paid_out") return "Paid out";
  return status.replace(/_/g, " ");
}

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
  stripeProcessingFeeEstimateUsd: number;
  payoutEstimateUsd: number;
  payoutStatus: string;
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

export function SellerOrderSidebarSections(props: SellerOrderSidebarProps) {
  return (
    <div className="space-y-3">
      <Panel title="Ship to">
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

      <Panel title="Your payout">
        <div className="space-y-2">
          <MoneyRow label="Get Vaulted fee" value={`−${formatMoney(props.platformFeeEstimateUsd)}`} />
          <MoneyRow label="Stripe fee" value={`−${formatMoney(props.stripeProcessingFeeEstimateUsd)}`} />
          <div className="my-2 border-t border-white/[0.06]" />
          <MoneyRow label="Est. payout" value={formatMoney(props.payoutEstimateUsd)} strong accent />
          <p className="pt-1 text-xs text-zinc-500">
            Status: <span className="font-semibold text-zinc-300">{formatPayoutStatus(props.payoutStatus)}</span>
            {" · "}
            3-day hold after delivery
          </p>
        </div>
      </Panel>
    </div>
  );
}
