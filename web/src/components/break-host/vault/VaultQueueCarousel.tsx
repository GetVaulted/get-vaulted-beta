"use client";

import type { LiveGiveawayDTO } from "@/lib/live-giveaway";
import type { SellerQueueTab } from "@/lib/seller-queue-tabs";
import { isGiveawayTab } from "@/lib/seller-queue-tabs";
import { VaultGiveawayLane } from "@/components/break-host/vault/VaultGiveawayLane";
import type { LiveRoomItemDTO } from "@/lib/live-room-serialize";
import { hostAuctionLaneItems, hostBinLaneItems } from "@/lib/live-buyer-queue-projection";

type ClaimLite = { user: { username: string } } | null;
export type VaultQueueRow = { item: LiveRoomItemDTO; claim: ClaimLite; claims: { user: { username: string } }[] };

function fmtMoney(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function titleLine(item: Pick<LiveRoomItemDTO, "title" | "displayTitle" | "progressLabel">) {
  const label = item.displayTitle?.trim() || item.title;
  return item.progressLabel ? `${label} · ${item.progressLabel}` : label;
}

type Tab = SellerQueueTab;

type VaultQueueCarouselProps = {
  tab: Tab;
  onTab: (t: Tab) => void;
  rows: VaultQueueRow[];
  giveaways?: LiveGiveawayDTO[];
  selectedId: string;
  onSelect: (id: string) => void;
  viewerCount: number;
  busy: boolean;
  onPost: (id: string) => void;
  onSkip?: (id: string) => void;
  onDelete: (id: string) => void;
  onAddAuction: () => void;
  onAddGiveaway?: () => void;
  onGiveawayOpenEntries?: (id: string) => void;
  onGiveawayCloseEntries?: (id: string) => void;
  onGiveawayDraw?: (id: string) => void;
  onGiveawayCancel?: (id: string) => void;
  onGiveawayDelete?: (id: string) => void;
  onGiveawayTimerExpired?: () => void;
  /** Tighter cards for desktop seller sidebar */
  compact?: boolean;
  /** Flat lineup tiles for floating queue drawer */
  lineup?: boolean;
};

export function VaultQueueCarousel({
  tab,
  onTab,
  rows,
  giveaways: giveawayRows = [],
  selectedId,
  onSelect,
  viewerCount,
  busy,
  onPost,
  onSkip,
  onDelete,
  onAddAuction,
  onAddGiveaway,
  onGiveawayOpenEntries,
  onGiveawayCloseEntries,
  onGiveawayDraw,
  onGiveawayCancel,
  onGiveawayDelete,
  onGiveawayTimerExpired,
  compact = false,
  lineup = false,
}: VaultQueueCarouselProps) {
  const auctionRows = hostAuctionLaneItems(rows.map((r) => r.item)).map((item) => {
    const row = rows.find((r) => r.item.id === item.id);
    return row ?? { item, claim: null, claims: [] };
  });
  const binRows = hostBinLaneItems(rows.map((r) => r.item)).map((item) => {
    const row = rows.find((r) => r.item.id === item.id);
    return row ?? { item, claim: null, claims: [] };
  });
  const soldRows = rows.filter((r) => r.item.status === "sold");

  const visible =
    tab === "sold"
      ? soldRows
      : tab === "bin"
        ? binRows
        : tab === "auction"
          ? auctionRows.length > 0
            ? auctionRows
            : rows.filter((r) => r.item.status !== "sold" && r.item.status !== "skipped")
          : [];

  const tabBtnClass = (active: boolean) =>
    lineup
      ? `rounded-md px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.14em] transition ${
          active
            ? "bg-white/[0.08] text-amber-100/95"
            : "text-zinc-600 hover:text-zinc-400"
        }`
      : `rounded-full border font-black uppercase tracking-wide transition ${
          compact ? "px-2 py-0.5 text-[9px]" : "px-3 py-1 text-[10px]"
        } ${
          active
            ? "border-amber-400/40 bg-amber-500/15 text-amber-100 shadow-[0_0_20px_-10px_rgba(245,158,11,0.45)]"
            : "border-white/10 bg-black/40 text-zinc-500 hover:border-white/20 hover:text-zinc-300"
        }`;

  return (
    <div className={lineup ? "space-y-2.5" : compact ? "space-y-2" : "space-y-3"}>
      <div className={lineup ? "live-stage-lineup-tabs flex gap-0.5 p-0.5" : "flex flex-wrap gap-1"}>
        {(
          [
            { id: "auction" as const, label: "Auction" },
            { id: "bin" as const, label: "Buy now" },
            { id: "giveaway" as const, label: "Giveaway" },
            { id: "buyers_giveaway" as const, label: "Buyers" },
            { id: "sold" as const, label: "Sold" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTab(t.id)}
            className={tabBtnClass(tab === t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "auction" ? (
        <button
          type="button"
          disabled={busy}
          onClick={onAddAuction}
          className={`w-full font-bold text-amber-100 disabled:opacity-50 ${
            lineup
              ? "rounded-lg border border-amber-400/20 bg-amber-500/10 py-1.5 text-[9px] uppercase tracking-wide hover:bg-amber-500/18"
              : `rounded-lg border border-amber-400/30 bg-gradient-to-r from-amber-500/15 to-yellow-500/10 ring-1 ring-amber-400/20 hover:from-amber-500/25 ${
                  compact ? "py-1.5 text-[10px]" : "rounded-xl py-2.5 text-[11px]"
                }`
          }`}
        >
          + Add to lineup
        </button>
      ) : null}

      {tab === "bin" ? (
        <button
          type="button"
          disabled={busy}
          onClick={onAddAuction}
          className={`w-full font-bold text-amber-100 disabled:opacity-50 ${
            lineup
              ? "rounded-lg border border-amber-400/20 bg-amber-500/10 py-1.5 text-[9px] uppercase tracking-wide hover:bg-amber-500/18"
              : `rounded-lg border border-amber-400/30 bg-gradient-to-r from-amber-500/15 to-yellow-500/10 ring-1 ring-amber-400/20 hover:from-amber-500/25 ${
                  compact ? "py-1.5 text-[10px]" : "rounded-xl py-2.5 text-[11px]"
                }`
          }`}
        >
          + Add buy-now SKU
        </button>
      ) : null}

      {isGiveawayTab(tab) ? (
        <VaultGiveawayLane
          kind={tab === "giveaway" ? "open" : "buyers"}
          giveaways={giveawayRows}
          busy={busy}
          lineup={lineup}
          onAdd={() => onAddGiveaway?.()}
          onOpenEntries={(id) => onGiveawayOpenEntries?.(id)}
          onCloseEntries={(id) => onGiveawayCloseEntries?.(id)}
          onDraw={(id) => onGiveawayDraw?.(id)}
          onCancel={(id) => onGiveawayCancel?.(id)}
          onDelete={(id) => onGiveawayDelete?.(id)}
          onTimerExpired={onGiveawayTimerExpired}
        />
      ) : null}

      {(tab === "auction" || tab === "bin" || tab === "sold") && visible.length === 0 ? (
        <p className="rounded-xl border border-zinc-800/80 bg-black/30 py-8 text-center text-[11px] text-zinc-600">No lots in this lane yet.</p>
      ) : null}

      {!isGiveawayTab(tab) ? (
      <div
        className={
          lineup
            ? "flex flex-col gap-1.5"
            : "-mx-1 flex gap-2 overflow-x-auto overflow-y-visible pb-2 pt-1 [scrollbar-width:thin]"
        }
      >
        {visible.map(({ item, claim }) => {
          const thumb = item.imageUrl?.trim();
          const selected = item.id === selectedId;
          const priceLabel =
            item.salesFormat === "buy_now"
              ? fmtMoney(item.priceUsd)
              : fmtMoney(item.currentBidUsd ?? item.startingBidUsd);
          const reserve =
            item.priceUsd != null && Number.isFinite(item.priceUsd)
              ? item.currentBidUsd != null && Number.isFinite(item.currentBidUsd) && item.currentBidUsd >= item.priceUsd
                ? "Met"
                : "Open"
              : "—";

          if (lineup) {
            const liveNow = item.status === "active";
            return (
              <div
                key={item.id}
                className={`live-stage-lineup-tile group relative flex items-center gap-2 rounded-xl px-2.5 py-2 transition ${
                  selected ? "live-stage-lineup-tile-selected" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  <div className="relative size-9 shrink-0 overflow-hidden rounded-lg bg-zinc-900/80">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="size-full object-cover opacity-90" />
                    ) : (
                      <div className="flex size-full items-center justify-center text-[10px] font-black text-zinc-600">
                        {(item.title ?? "—").slice(0, 1)}
                      </div>
                    )}
                    {liveNow ? (
                      <span className="absolute inset-x-0 bottom-0 bg-emerald-500/80 py-px text-center text-[6px] font-black uppercase text-white">
                        Live
                      </span>
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-semibold text-zinc-100">{titleLine(item)}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[9px]">
                      <span className="font-mono font-bold text-amber-100/90">{priceLabel}</span>
                      <span className="text-zinc-600">·</span>
                      <span className="uppercase tracking-wide text-zinc-500">{item.status}</span>
                      {item.progressLabel ? (
                        <>
                          <span className="text-zinc-700">·</span>
                          <span className="text-zinc-500">{item.progressLabel}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </button>
                <div className="flex shrink-0 gap-1 opacity-80 transition group-hover:opacity-100">
                  {item.status !== "active" && item.status !== "sold" && item.status !== "skipped" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onPost(item.id)}
                      className="rounded-md px-2 py-1 text-[8px] font-black uppercase tracking-wide text-violet-200/90 hover:bg-violet-500/15"
                    >
                      Pin
                    </button>
                  ) : null}
                  {item.status !== "sold" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onDelete(item.id)}
                      className="rounded-md px-1.5 py-1 text-[8px] font-semibold text-zinc-600 hover:text-rose-300/90"
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              </div>
            );
          }

          return (
            <div
              key={item.id}
              className={`relative shrink-0 rounded-xl p-px ${
                compact ? "w-[min(11rem,72vw)]" : "w-[min(13.5rem,78vw)]"
              } ${
                selected ? "bg-gradient-to-br from-amber-300/50 via-amber-500/30 to-transparent" : "bg-gradient-to-br from-white/10 to-transparent"
              }`}
            >
              <div className={`flex h-full flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-zinc-950/70 shadow-[0_18px_50px_-28px_rgba(0,0,0,0.9)] backdrop-blur-md ${compact ? "" : "rounded-2xl"}`}>
                <button type="button" onClick={() => onSelect(item.id)} className="relative block w-full text-left">
                  <div className={`relative w-full bg-zinc-900 ${compact ? "aspect-[5/3]" : "aspect-[4/3]"}`}>
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="size-full object-cover opacity-95" />
                    ) : (
                      <div className="flex size-full items-center justify-center text-sm font-black text-zinc-600">
                        {(item.title ?? "—").slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 pb-2 pt-8">
                      <p className="line-clamp-2 text-[11px] font-semibold leading-snug text-white">{titleLine(item)}</p>
                    </div>
                  </div>
                </button>
                <div className={`space-y-1 ${compact ? "px-2 py-1.5" : "space-y-1.5 px-2.5 py-2"}`}>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-mono font-bold text-zinc-200">{priceLabel}</span>
                    <span className="text-zinc-500">{viewerCount} room</span>
                  </div>
                  <div className="flex flex-wrap gap-1 text-[9px] font-bold uppercase tracking-wide text-zinc-500">
                    <span className="rounded border border-white/10 bg-black/40 px-1.5 py-0.5 text-zinc-400">{item.status}</span>
                    <span className="rounded border border-white/10 bg-black/40 px-1.5 py-0.5">Reserve {reserve}</span>
                    <span className="rounded border border-amber-400/15 bg-amber-500/10 px-1.5 py-0.5 text-amber-100/90">Vault ship</span>
                  </div>
                  {item.lastHighBidderUsername?.trim() ? (
                    <p className="truncate text-[10px] font-semibold text-amber-100/90">
                      Winning @{item.lastHighBidderUsername.trim()}
                    </p>
                  ) : null}
                  {claim ? (
                    <p className="truncate text-[10px] text-zinc-400">
                      @{claim.user.username}
                      {item.status === "sold" ? <span className="text-emerald-300/90"> · winner</span> : null}
                    </p>
                  ) : null}
                  <div className="flex gap-1.5 pt-1">
                    {item.status !== "active" && item.status !== "sold" && item.status !== "skipped" ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onPost(item.id)}
                        className="min-h-8 flex-1 rounded-lg border border-violet-400/30 bg-violet-500/15 text-[10px] font-black uppercase tracking-wide text-violet-100 hover:bg-violet-500/25"
                      >
                        Pin
                      </button>
                    ) : null}
                    {item.status !== "sold" && item.status !== "skipped" && onSkip ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onSkip(item.id)}
                        className="min-h-8 flex-1 rounded-lg border border-amber-500/25 bg-amber-500/10 text-[10px] font-semibold text-amber-100 hover:bg-amber-500/20"
                      >
                        Skip
                      </button>
                    ) : null}
                    {item.status !== "sold" ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onDelete(item.id)}
                        className="min-h-8 flex-1 rounded-lg border border-rose-500/25 text-[10px] font-semibold text-rose-200/90 hover:bg-rose-500/10"
                      >
                        Drop
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      ) : null}

      {!compact && !lineup && !isGiveawayTab(tab) ? (
        <p className="text-center text-[10px] text-zinc-600">Drag-to-reorder sync is coming — order follows your queue for now.</p>
      ) : null}
    </div>
  );
}
