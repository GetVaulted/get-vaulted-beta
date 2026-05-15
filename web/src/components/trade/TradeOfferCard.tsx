import Link from "next/link";
import { formatRelativeTradeDate, summarizeCash } from "@/lib/trade-offers";

export type TradeOfferCardData = {
  id: string;
  status: string;
  offeredCount: number;
  requestedCount: number;
  proposerCashUsd: number;
  recipientCashUsd: number;
  counterpartyUsername: string;
  createdAtIso: string;
  updatedAtIso: string;
};

function statusTone(status: string): string {
  if (status === "pending" || status === "countered") return "border-gold/30 bg-gold/10 text-gold-bright";
  if (status === "accepted" || status === "completed") return "border-emerald-400/25 bg-emerald-500/10 text-emerald-200";
  if (status === "declined") return "border-zinc-500/25 bg-zinc-800/40 text-zinc-300";
  if (status === "cancelled") return "border-rose-400/25 bg-rose-950/30 text-rose-200";
  return "border-amber-400/25 bg-amber-950/35 text-amber-100";
}

export function TradeOfferCard({
  offer,
  canAct,
}: {
  offer: TradeOfferCardData;
  canAct: boolean;
}) {
  return (
    <article className="rounded-2xl border border-white/[0.08] bg-[#09090c]/85 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-100">@{offer.counterpartyUsername}</p>
          <p className="mt-1 text-[11px] text-zinc-500">Updated {formatRelativeTradeDate(offer.updatedAtIso)}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusTone(offer.status)}`}>
          {offer.status}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-400">
        <div className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2">
          <dt>Offered items</dt>
          <dd className="mt-0.5 text-sm font-semibold text-zinc-100">{offer.offeredCount}</dd>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2">
          <dt>Requested items</dt>
          <dd className="mt-0.5 text-sm font-semibold text-zinc-100">{offer.requestedCount}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-gold-bright">{summarizeCash(offer.proposerCashUsd, offer.recipientCashUsd)}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-[11px] text-zinc-500">Created {formatRelativeTradeDate(offer.createdAtIso)}</p>
        <Link
          href={`/trade/${encodeURIComponent(offer.id)}`}
          className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-gold/35 hover:text-gold-bright"
        >
          {canAct ? "Review" : "View"}
        </Link>
      </div>
    </article>
  );
}
