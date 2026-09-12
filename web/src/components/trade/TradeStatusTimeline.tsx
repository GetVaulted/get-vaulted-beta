import { formatRelativeTradeDate, formatTradeEventNote } from "@/lib/trade-offers";

type TradeEvent = {
  id: string;
  type: string;
  note: string | null;
  createdAtIso: string;
  actorUsername: string | null;
};

function eventLabel(type: string): string {
  if (type === "offer_created") return "Offer created";
  if (type === "offer_countered") return "Counter sent";
  if (type === "offer_accepted") return "Offer accepted";
  if (type === "offer_declined") return "Offer declined";
  if (type === "offer_cancelled") return "Offer cancelled";
  if (type === "offer_expired") return "Offer expired";
  if (type === "platform_fee_paid") return "Platform fee paid";
  if (type === "cash_paid") return "Trade cash paid";
  if (type === "shipping_label_purchased") return "Shipping label purchased";
  if (type === "shipping_label_failed") return "Label purchase failed";
  if (type === "party_shipped") return "Package shipped";
  if (type === "party_received") return "Receipt confirmed";
  if (type === "offer_completed") return "Trade completed";
  if (type === "dispute_opened") return "Dispute opened";
  if (type === "cash_released") return "Trade cash released";
  if (type === "cash_refunded") return "Trade cash refunded";
  if (type === "dispute_resolved") return "Dispute resolved";
  if (type === "deposit_paid") return "Security deposit paid";
  if (type === "deposit_refunded") return "Security deposit refunded";
  return "Trade update";
}

export function TradeStatusTimeline({ events }: { events: TradeEvent[] }) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#09090c]/85 p-4">
      <p className="text-sm font-semibold text-zinc-100">Timeline</p>
      <ol className="mt-3 space-y-3">
        {events.map((evt) => {
          const detail = formatTradeEventNote(evt.type, evt.note);
          return (
          <li key={evt.id} className="relative rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5">
            <p className="text-xs font-semibold text-zinc-100">{eventLabel(evt.type)}</p>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {evt.actorUsername ? `@${evt.actorUsername} · ` : ""}
              {formatRelativeTradeDate(evt.createdAtIso)}
            </p>
            {detail ? <p className="mt-1 text-xs text-zinc-300">{detail}</p> : null}
          </li>
          );
        })}
      </ol>
    </section>
  );
}
