"use client";

import { loadStripe } from "@stripe/stripe-js";
import { useEffect, useMemo, useState } from "react";
import type { LiveItemVariantDTO, LiveRoomItemDTO } from "@/lib/live-room-serialize";
import { sortVariantsForBuyerDisplay } from "@/lib/live-item-variant-display-order";
import { isVariantSalesFormat, isRandomVariantAssignment, variantBuyerSelectLabel } from "@/lib/live-item-variant-presets";
import {
  createLiveVariantPurchaseIdempotencyKey,
  purchaseLiveItemVariant,
  syncLiveItemVariantPurchase,
} from "@/lib/live-variant-purchase-client";
import { HoldToBuyButton } from "@/components/live-auction/HoldToBuyButton";

type LiveVariantSelectionSheetProps = {
  open: boolean;
  onClose: () => void;
  item: LiveRoomItemDTO;
  liveRoomId: string;
  walletReady: boolean;
  onWalletRequired: () => void;
  onPurchased?: (payload: {
    itemId: string;
    variantId: string;
    quantity: number;
    label: string;
    amountUsd: number;
  }) => void;
};

function fmtMoney(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function summarizeSpots(variants: LiveItemVariantDTO[]) {
  let available = 0;
  const prices: number[] = [];
  for (const v of variants) {
    const sold = v.quantityRemaining <= 0 || v.status === "sold_out";
    if (!sold) {
      available += v.quantityRemaining;
      if (Number.isFinite(v.priceUsd)) prices.push(v.priceUsd);
    }
  }
  return {
    available,
    fromPrice: prices.length ? Math.min(...prices) : null,
  };
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

  const isRandom = isRandomVariantAssignment(item.variantAssignmentMode);
  const variants = useMemo(() => sortVariantsForBuyerDisplay(item.variants ?? []), [item.variants]);
  const selected = variants.find((v) => v.id === selectedId) ?? null;
  const spotSummary = useMemo(() => summarizeSpots(variants), [variants]);
  const pickerBase = variantBuyerSelectLabel(item.salesFormat, isRandom);
  const pickerTitle = selected ? `${pickerBase}: ${selected.label}` : pickerBase;
  const unitPrice = selected?.priceUsd ?? spotSummary.fromPrice ?? 0;
  const maxQty = selected ? Math.max(1, selected.quantityRemaining) : 1;

  const total = useMemo(() => {
    if (!selected) return 0;
    return Math.round(selected.priceUsd * quantity * 100) / 100;
  }, [quantity, selected]);

  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setQuantity(1);
      setError(null);
      setBusy(false);
      return;
    }
    if (isRandom) {
      const available = variants.find((v) => v.quantityRemaining > 0 && v.status !== "sold_out");
      if (available) setSelectedId(available.id);
    }
  }, [open, isRandom, variants]);

  useEffect(() => {
    setQuantity(1);
  }, [selectedId]);

  if (!open || !isVariantSalesFormat(item.salesFormat) || variants.length === 0) return null;

  const checkout = async () => {
    if (!selected) {
      setError("Select a spot first.");
      return;
    }
    if (selected.quantityRemaining <= 0 || selected.status === "sold_out") {
      setError("That spot was just taken. Pick another.");
      return;
    }
    if (!walletReady) {
      onWalletRequired();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await purchaseLiveItemVariant({
        liveRoomId,
        itemId: item.id,
        variantId: selected.id,
        quantity,
        idempotencyKey: createLiveVariantPurchaseIdempotencyKey(selected.id),
      });
      if (!res.ok) {
        if (res.status === 401 && res.signInUrl) {
          window.location.href = res.signInUrl;
          return;
        }
        if (res.walletIncomplete) {
          onWalletRequired();
          return;
        }
        setError(res.error);
        return;
      }
      if (res.ok && "paid" in res && res.paid) {
        onPurchased?.({
          itemId: item.id,
          variantId: selected.id,
          quantity,
          label: selected.label,
          amountUsd: selected.priceUsd * quantity,
        });
        onClose();
        return;
      }
      if (res.ok && "requiresAction" in res && res.requiresAction) {
        const pk =
          res.publishableKey?.trim() ||
          process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ||
          "";
        const stripe = pk ? await loadStripe(pk) : null;
        if (!stripe) {
          setError("Complete payment verification in your Wallet, then try again.");
          return;
        }
        const conf = await stripe.confirmCardPayment(res.clientSecret);
        if (conf.error) {
          setError(conf.error.message ?? "Payment authentication failed.");
          return;
        }
        const synced = await syncLiveItemVariantPurchase({
          liveRoomId,
          itemId: item.id,
          variantId: selected.id,
          purchaseId: res.purchaseId,
        });
        if (synced.ok && "paid" in synced && synced.paid) {
          onPurchased?.({
            itemId: item.id,
            variantId: selected.id,
            quantity,
            label: selected.label,
            amountUsd: selected.priceUsd * quantity,
          });
          onClose();
          return;
        }
        setError(!synced.ok ? synced.error : "Payment is still processing — refresh the room.");
        return;
      }
      if (res.ok && "processing" in res && res.processing) {
        setError("Payment processing — refresh the room in a moment.");
        return;
      }
      setError("Purchase could not complete.");
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  };

  const allSold = spotSummary.available <= 0;

  return (
    <div className="pointer-events-none fixed inset-0 z-[55] flex items-end justify-center">
      <button
        type="button"
        aria-label="Close checkout"
        className="pointer-events-auto absolute inset-0 bg-black/48"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label="Checkout"
        className="pointer-events-auto relative z-10 flex max-h-[72vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#0b0b10] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.06] px-4 pb-2 pt-3">
          <div>
            <h2 className="text-lg font-black text-white">Checkout</h2>
            <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-zinc-500">
              <span aria-hidden>🔒</span>
              Secure checkout · encrypted by Stripe
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 items-center justify-center rounded-full bg-white/[0.06] text-zinc-300"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="flex gap-3">
            {item.imageUrl?.trim() ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.imageUrl} alt="" className="size-16 shrink-0 rounded-xl object-cover" />
            ) : (
              <div className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] text-xl font-black text-zinc-600">
                {item.title.slice(0, 1)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-extrabold text-white">{item.title}</p>
              <p className="mt-0.5 font-mono text-[15px] font-black text-amber-300">{fmtMoney(unitPrice)}</p>
              <p className="mt-0.5 text-[11px] font-semibold text-zinc-500">
                {allSold
                  ? "All spots sold"
                  : `${spotSummary.available} spot${spotSummary.available === 1 ? "" : "s"} remaining`}
              </p>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-[9px] font-extrabold uppercase tracking-wide text-zinc-500">Qty</span>
              <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/35 px-1 py-1">
                <button
                  type="button"
                  disabled={quantity <= 1 || !selected}
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="size-7 rounded-md bg-white/[0.06] text-sm font-bold text-white disabled:opacity-35"
                >
                  −
                </button>
                <span className="min-w-[1.25rem] text-center font-mono text-sm font-black text-white">{quantity}</span>
                <button
                  type="button"
                  disabled={!selected || quantity >= maxQty}
                  onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                  className="size-7 rounded-md bg-white/[0.06] text-sm font-bold text-white disabled:opacity-35"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-sm font-black text-white">{pickerTitle}</p>
            <p className="mt-0.5 text-[11px] font-semibold text-zinc-500">
              {isRandom
                ? "Hold to buy — the Vault wheel assigns your team from what's left"
                : selected
                  ? "Confirm your spot and hold to buy below"
                  : "Tap a team or division to continue"}
            </p>
            {!isRandom ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {variants.map((v) => (
                  <VariantPill
                    key={v.id}
                    variant={v}
                    selected={selectedId === v.id}
                    onSelect={() => {
                      if (v.quantityRemaining <= 0 || v.status === "sold_out") return;
                      setSelectedId(v.id);
                      setError(null);
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-amber-400/25 bg-gradient-to-r from-amber-500/10 to-zinc-950/80 px-4 py-3 text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-200/90">Vault Reveal</p>
                <p className="mt-1 text-sm font-bold text-white">
                  {spotSummary.available} {item.salesFormat === "team_break" ? "divisions" : "teams"} left on the wheel
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 space-y-2 rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2 text-[11px]">
            <SummaryRow label="Shipping" value={walletReady ? "Uses your Vault wallet address" : "Add shipping in Vault Wallet"} />
            <SummaryRow label="Payment" value={walletReady ? "Saved card in Vault Wallet" : "Add a card in Vault Wallet"} />
            <SummaryRow label="Taxes" value="Calculated at checkout" />
          </div>

          {!walletReady ? (
            <button
              type="button"
              onClick={onWalletRequired}
              className="mt-3 w-full rounded-xl border border-amber-400/30 bg-amber-500/10 py-2.5 text-xs font-extrabold uppercase tracking-wide text-amber-200"
            >
              Set up wallet on this screen
            </button>
          ) : null}

          {error ? <p className="mt-3 text-center text-xs text-rose-300">{error}</p> : null}
        </div>

        <div className="flex shrink-0 items-end gap-3 border-t border-white/[0.08] px-4 py-3">
          <div className="min-w-[5.5rem]">
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-zinc-500">Total</p>
            <p className="font-mono text-2xl font-black text-amber-300">{selected ? fmtMoney(total) : "—"}</p>
          </div>
          <div className="min-w-0 flex-1">
            <HoldToBuyButton
              label={
                selected
                  ? isRandom
                    ? `Hold to buy · wheel reveal · ${fmtMoney(total)}`
                    : `Hold to buy · ${fmtMoney(total)}`
                  : "Select a spot"
              }
              disabled={!selected || allSold}
              busy={busy}
              onHoldStart={() => {
                if (!walletReady) {
                  onWalletRequired();
                  return false;
                }
                return true;
              }}
              onCommit={() => void checkout()}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 font-bold text-zinc-500">{label}</span>
      <span className="flex-1 text-right font-semibold text-zinc-300">{value}</span>
    </div>
  );
}

function VariantPill({
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
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      className={`relative min-w-[5.5rem] max-w-[48%] flex-grow cursor-pointer rounded-full border px-3 py-2 text-left transition ${
        soldOut
          ? "cursor-not-allowed border-dashed border-white/15 bg-white/[0.015] opacity-70"
          : selected
            ? "border-amber-400/55 bg-amber-500/10"
            : "border-white/15 bg-white/[0.03] hover:border-white/25"
      }`}
    >
      {variant.isHot && !soldOut ? (
        <span className="absolute -top-1.5 right-2 rounded-full border border-white/20 bg-red-600 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-white">
          Hot
        </span>
      ) : null}
      <span
        className={`block text-xs font-bold ${soldOut ? "text-zinc-500 line-through" : selected ? "font-black text-white" : "text-zinc-200"}`}
      >
        {variant.label}
      </span>
      {!soldOut ? (
        <span className={`mt-0.5 block font-mono text-[10px] font-bold ${selected ? "text-amber-300" : "text-zinc-500"}`}>
          {fmtMoney(variant.priceUsd)}
        </span>
      ) : (
        <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-wide text-zinc-600">Sold</span>
      )}
    </button>
  );
}
