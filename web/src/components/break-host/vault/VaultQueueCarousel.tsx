"use client";

import type { LiveRoomItemDTO } from "@/lib/live-room-serialize";

type ClaimLite = { user: { username: string } } | null;
export type VaultQueueRow = { item: LiveRoomItemDTO; claim: ClaimLite; claims: { user: { username: string } }[] };

function fmtMoney(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function titleLine(title: string, quantity: number) {
  const q = typeof quantity === "number" && Number.isFinite(quantity) && quantity >= 1 ? Math.floor(quantity) : 1;
  if (q <= 1) return title;
  return `${title} · ×${q}`;
}

type Tab = "auction" | "bin" | "givvy" | "sold";

type VaultQueueCarouselProps = {
  tab: Tab;
  onTab: (t: Tab) => void;
  rows: VaultQueueRow[];
  selectedId: string;
  onSelect: (id: string) => void;
  viewerCount: number;
  busy: boolean;
  onPost: (id: string) => void;
  onDelete: (id: string) => void;
  onAddAuction: () => void;
};

export function VaultQueueCarousel({
  tab,
  onTab,
  rows,
  selectedId,
  onSelect,
  viewerCount,
  busy,
  onPost,
  onDelete,
  onAddAuction,
}: VaultQueueCarouselProps) {
  const auctionRows = rows.filter((r) => r.item.status !== "sold" && r.item.status !== "skipped");
  const soldRows = rows.filter((r) => r.item.status === "sold");

  const visible =
    tab === "sold"
      ? soldRows
      : tab === "auction"
        ? auctionRows.length > 0
          ? auctionRows
          : rows
        : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            { id: "auction" as const, label: "Auction" },
            { id: "bin" as const, label: "Buy now" },
            { id: "givvy" as const, label: "Giveaway" },
            { id: "sold" as const, label: "Sold" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTab(t.id)}
            className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wide transition ${
              tab === t.id
                ? "border-amber-400/40 bg-amber-500/15 text-amber-100 shadow-[0_0_20px_-10px_rgba(245,158,11,0.45)]"
                : "border-white/10 bg-black/40 text-zinc-500 hover:border-white/20 hover:text-zinc-300"
            }`}
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
          className="w-full rounded-xl border border-amber-400/30 bg-gradient-to-r from-amber-500/15 to-yellow-500/10 py-2.5 text-[11px] font-bold text-amber-100 ring-1 ring-amber-400/20 hover:from-amber-500/25 disabled:opacity-50"
        >
          + Add to vault queue
        </button>
      ) : null}

      {tab === "bin" || tab === "givvy" ? (
        <p className="rounded-xl border border-dashed border-zinc-700/80 bg-zinc-950/40 px-3 py-4 text-center text-[11px] leading-relaxed text-zinc-500">
          {tab === "bin"
            ? "Buy-now lane is being wired to checkout. Run auctions from the auction lane for now."
            : "Giveaway lane hooks into your givvy flow soon — queue winners here once the API lands."}
        </p>
      ) : null}

      {(tab === "auction" || tab === "sold") && visible.length === 0 ? (
        <p className="rounded-xl border border-zinc-800/80 bg-black/30 py-8 text-center text-[11px] text-zinc-600">No lots in this lane yet.</p>
      ) : null}

      <div className="-mx-1 flex gap-2 overflow-x-auto overflow-y-visible pb-2 pt-1 [scrollbar-width:thin]">
        {visible.map(({ item, claim }) => {
          const thumb = item.imageUrl?.trim();
          const selected = item.id === selectedId;
          const reserve =
            item.priceUsd != null && Number.isFinite(item.priceUsd)
              ? item.currentBidUsd != null && Number.isFinite(item.currentBidUsd) && item.currentBidUsd >= item.priceUsd
                ? "Met"
                : "Open"
              : "—";
          return (
            <div
              key={item.id}
              className={`relative w-[min(13.5rem,78vw)] shrink-0 rounded-2xl p-px ${
                selected ? "bg-gradient-to-br from-amber-300/50 via-amber-500/30 to-transparent" : "bg-gradient-to-br from-white/10 to-transparent"
              }`}
            >
              <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-zinc-950/70 shadow-[0_18px_50px_-28px_rgba(0,0,0,0.9)] backdrop-blur-md">
                <button type="button" onClick={() => onSelect(item.id)} className="relative block w-full text-left">
                  <div className="relative aspect-[4/3] w-full bg-zinc-900">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="size-full object-cover opacity-95" />
                    ) : (
                      <div className="flex size-full items-center justify-center text-sm font-black text-zinc-600">
                        {(item.title ?? "—").slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 pb-2 pt-8">
                      <p className="line-clamp-2 text-[11px] font-semibold leading-snug text-white">{titleLine(item.title, item.quantity)}</p>
                    </div>
                  </div>
                </button>
                <div className="space-y-1.5 px-2.5 py-2">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-mono font-bold text-zinc-200">{fmtMoney(item.currentBidUsd ?? item.startingBidUsd)}</span>
                    <span className="text-zinc-500">{viewerCount} room</span>
                  </div>
                  <div className="flex flex-wrap gap-1 text-[9px] font-bold uppercase tracking-wide text-zinc-500">
                    <span className="rounded border border-white/10 bg-black/40 px-1.5 py-0.5 text-zinc-400">{item.status}</span>
                    <span className="rounded border border-white/10 bg-black/40 px-1.5 py-0.5">Reserve {reserve}</span>
                    <span className="rounded border border-amber-400/15 bg-amber-500/10 px-1.5 py-0.5 text-amber-100/90">Vault ship</span>
                  </div>
                  {claim ? (
                    <p className="truncate text-[10px] text-zinc-400">
                      @{claim.user.username}
                      {item.status === "sold" ? <span className="text-emerald-300/90"> · winner</span> : null}
                    </p>
                  ) : null}
                  <div className="flex gap-1.5 pt-1">
                    {item.status !== "active" && item.status !== "sold" ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onPost(item.id)}
                        className="min-h-8 flex-1 rounded-lg border border-violet-400/30 bg-violet-500/15 text-[10px] font-black uppercase tracking-wide text-violet-100 hover:bg-violet-500/25"
                      >
                        Pin
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

      <p className="text-center text-[10px] text-zinc-600">Drag-to-reorder sync is coming — order follows your queue for now.</p>
    </div>
  );
}
