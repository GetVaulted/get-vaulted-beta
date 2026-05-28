"use client";

import { useMemo, useState } from "react";
import type { LiveItemVariantDTO, LiveRoomItemDTO } from "@/lib/live-room-serialize";
import { isVariantSalesFormat } from "@/lib/live-item-variant-presets";
import { createLiveVariantPurchaseIdempotencyKey } from "@/lib/live-variant-purchase-client";

type LiveVariantSelectionSheetProps = {
  open: boolean;
  onClose: () => void;
  item: LiveRoomItemDTO;
  liveRoomId: string;
  walletReady: boolean;
  onWalletRequired: () => void;
  onPurchased?: () => void;
};

function fmtMoney(n: number) {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export function LiveVariantSelectionSheet({
  open,
  onClose,
  item,
  liveRoomId,
  walletReady,
  onWalletRequired,
  onPurchased,
}: LiveVariantSelectionSheetProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const variants = item.variants ?? [];
  const selected = variants.find((v) => v.id === selectedId) ?? null;

  const total = useMemo(() => {
    if (!selected) return 0;
    return Math.round(selected.priceUsd * quantity * 100) / 100;
  }, [selected, quantity]);

  if (!open || !isVariantSalesFormat(item.salesFormat) || variants.length === 0) return null;

  const checkout = async () => {
    if (!selected) {
      setError("Select an option first.");
      return;
    }
    if (selected.quantityRemaining <= 0 || selected.status === "sold_out") {
      setError("That option is sold out.");
      return;
    }
    if (!walletReady) {
      onWalletRequired();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/live-rooms/${encodeURIComponent(liveRoomId)}/items/${encodeURIComponent(item.id)}/variants/${encodeURIComponent(selected.id)}/purchase`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": createLiveVariantPurchaseIdempotencyKey(selected.id),
          },
          credentials: "include",
          body: JSON.stringify({ quantity }),
        },
      );
      const payload = (await res.json()) as {
        error?: string;
        checkoutUrl?: string;
        paid?: boolean;
        signInUrl?: string;
      };
      if (res.status === 401 && payload.signInUrl) {
        window.location.href = payload.signInUrl;
        return;
      }
      if (res.status === 402) {
        onWalletRequired();
        return;
      }
      if (!res.ok) {
        setError(typeof payload.error === "string" ? payload.error : "Checkout failed.");
        return;
      }
      if (payload.paid) {
        onPurchased?.();
        onClose();
        return;
      }
      if (payload.checkoutUrl) {
        window.location.href = payload.checkoutUrl;
        return;
      }
      setError("Checkout could not start.");
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pointer-events-auto fixed inset-0 z-[55] flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4">
      <button type="button" aria-label="Close" className="absolute inset-0" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Select option"
        className="relative z-10 w-full max-w-md rounded-t-2xl border border-white/[0.08] bg-zinc-950/95 p-4 shadow-2xl backdrop-blur-xl sm:rounded-2xl"
      >
        <div className="flex gap-3">
          {item.imageUrl?.trim() ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.imageUrl} alt="" className="size-16 shrink-0 rounded-xl object-cover" />
          ) : (
            <div className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-lg font-black text-zinc-600">
              {item.title.slice(0, 1)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm font-bold text-white">{item.title}</p>
            <p className="mt-0.5 text-[11px] text-zinc-500">Pick your spot / option</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {variants.map((v) => (
            <VariantChip key={v.id} variant={v} selected={selectedId === v.id} onSelect={() => setSelectedId(v.id)} />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl border border-white/[0.06] bg-black/30 px-3 py-2">
          <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Quantity</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={quantity <= 1}
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="size-7 rounded-lg border border-white/10 text-sm font-bold text-zinc-300 disabled:opacity-40"
            >
              −
            </button>
            <span className="min-w-[1.5rem] text-center font-mono text-sm font-black tabular-nums text-white">{quantity}</span>
            <button
              type="button"
              disabled={!selected || quantity >= selected.quantityRemaining}
              onClick={() => setQuantity((q) => q + 1)}
              className="size-7 rounded-lg border border-white/10 text-sm font-bold text-zinc-300 disabled:opacity-40"
            >
              +
            </button>
          </div>
        </div>

        <p className="mt-3 text-center font-mono text-lg font-black tabular-nums text-amber-100">
          {selected ? fmtMoney(total) : "—"}
        </p>

        {error ? <p className="mt-2 text-center text-[11px] text-rose-300/90">{error}</p> : null}

        <button
          type="button"
          disabled={busy || !selected}
          onClick={() => void checkout()}
          className="mt-3 w-full rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 py-3 text-sm font-black uppercase tracking-wide text-zinc-950 disabled:opacity-45"
        >
          {busy ? "Processing…" : "Checkout"}
        </button>
      </div>
    </div>
  );
}

function VariantChip({
  variant,
  selected,
  onSelect,
}: {
  variant: LiveItemVariantDTO;
  selected: boolean;
  onSelect: () => void;
}) {
  const soldOut = variant.quantityRemaining <= 0 || variant.status === "sold_out";
  return (
    <button
      type="button"
      disabled={soldOut}
      onClick={onSelect}
      className={`rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold transition ${
        soldOut
          ? "border-zinc-800 bg-zinc-900/60 text-zinc-600 line-through"
          : selected
            ? "border-amber-400/40 bg-amber-500/15 text-amber-50 shadow-[0_0_24px_-12px_rgba(251,191,36,0.5)]"
            : "border-white/10 bg-black/40 text-zinc-200 hover:border-white/20"
      }`}
    >
      {variant.label}
      {variant.isHot ? " 🔥" : ""}
      {soldOut ? "" : ` · ${fmtMoney(variant.priceUsd)}`}
    </button>
  );
}
