import { summarizeCash, formatMoney } from "@/lib/trade-offers";

export function TradeValueSummary({
  offeredCount,
  requestedCount,
  offeredValue,
  requestedValue,
  proposerCashUsd,
  recipientCashUsd,
}: {
  offeredCount: number;
  requestedCount: number;
  offeredValue: number;
  requestedValue: number;
  proposerCashUsd: number;
  recipientCashUsd: number;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-black/20 p-3 text-xs text-zinc-400">
      <div className="flex items-center justify-between">
        <span>Offered ({offeredCount})</span>
        <span className="font-semibold text-zinc-200">{formatMoney(offeredValue)}</span>
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span>Requested ({requestedCount})</span>
        <span className="font-semibold text-zinc-200">{formatMoney(requestedValue)}</span>
      </div>
      <div className="mt-2 border-t border-white/[0.06] pt-2 text-[11px] text-gold-bright">
        {summarizeCash(proposerCashUsd, recipientCashUsd)}
      </div>
    </div>
  );
}
