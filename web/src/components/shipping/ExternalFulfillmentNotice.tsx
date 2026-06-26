import {
  EXTERNAL_FULFILLMENT_BUYER_BODY,
  EXTERNAL_FULFILLMENT_HOST_BODY,
  EXTERNAL_FULFILLMENT_TITLE,
} from "@/lib/shipping/external-fulfillment-copy";

type Props = {
  audience: "host" | "buyer";
  compact?: boolean;
};

/** Banner for break/PYT sales that settle without a platform Order + Shippo label. */
export function ExternalFulfillmentNotice({ audience, compact = false }: Props) {
  const body = audience === "host" ? EXTERNAL_FULFILLMENT_HOST_BODY : EXTERNAL_FULFILLMENT_BUYER_BODY;

  return (
    <div
      className={
        compact
          ? "rounded-xl border border-amber-400/25 bg-amber-950/40 px-3 py-2 text-left"
          : "rounded-2xl border border-amber-400/30 bg-amber-950/50 px-4 py-3 text-left"
      }
      role="status"
    >
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-300/90">
        {EXTERNAL_FULFILLMENT_TITLE}
      </p>
      <p className={compact ? "mt-1 text-xs leading-snug text-amber-50/90" : "mt-2 text-sm leading-relaxed text-amber-50/90"}>
        {body}
      </p>
    </div>
  );
}
