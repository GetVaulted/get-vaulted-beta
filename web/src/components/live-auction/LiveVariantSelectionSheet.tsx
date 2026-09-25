"use client";

import { loadStripe } from "@stripe/stripe-js";
import { useEffect, useMemo, useState } from "react";
import type { LiveItemVariantDTO, LiveRoomItemDTO } from "@/lib/live-room-serialize";
import { sortVariantsForBuyerDisplay } from "@/lib/live-item-variant-display-order";
import { isVariantSalesFormat, isRandomVariantAssignment, variantBuyerSelectLabel } from "@/lib/live-item-variant-presets";
import { formatSoldSpotBuyerLabel } from "@/lib/live-variant-spot-board";
import {
  createLiveVariantBatchPurchaseIdempotencyKey,
  createLiveVariantPurchaseIdempotencyKey,
  purchaseLiveItemVariant,
  purchaseLiveItemVariantBatch,
  syncLiveItemVariantPurchase,
  syncLiveItemVariantPurchaseBatch,
} from "@/lib/live-variant-purchase-client";
import { formatBatchSpotCelebrationLabel } from "@/lib/live-spot-celebration";
import { HoldToBuyButton } from "@/components/live-auction/HoldToBuyButton";
import {
  fetchLiveVariantCheckoutPreview,
  type LiveVariantCheckoutPreview,
} from "@/lib/live-variant-checkout-preview-client";

type LiveVariantSelectionSheetProps = {
  open: boolean;
  onClose: () => void;
  item: LiveRoomItemDTO;
  liveRoomId: string;
  walletReady: boolean;
  /** Pre-select host-pinned team/division when opening checkout. */
  initialVariantId?: string | null;
  onWalletRequired: () => void;
  /** Hide teams currently in spot auction (buyers bid on those instead). */
  excludeVariantIds?: string[];
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

function variantIsAvailable(v: LiveItemVariantDTO) {
  return v.quantityRemaining > 0 && v.status !== "sold_out";
}

export function LiveVariantSelectionSheet({
  open,
  onClose,
  item,
  liveRoomId,
  walletReady,
  onWalletRequired,
  excludeVariantIds,
  initialVariantId,
  onPurchased,
}: LiveVariantSelectionSheetProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutPreview, setCheckoutPreview] = useState<LiveVariantCheckoutPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [spotSearch, setSpotSearch] = useState("");

  const isRandom = isRandomVariantAssignment(item.variantAssignmentMode);
  const isDivisionBreak = item.salesFormat === "team_break";
  const isPlayerBreak = item.salesFormat === "player_selection";
  const spotNoun = isDivisionBreak ? "divisions" : isPlayerBreak ? "players" : "teams";
  const spotNounSingular = isDivisionBreak ? "division" : isPlayerBreak ? "player" : "team";
  const pickerVariants = useMemo(() => {
    const exclude = new Set(excludeVariantIds ?? []);
    return (item.variants ?? []).filter((v) => !exclude.has(v.id));
  }, [excludeVariantIds, item.variants]);
  const variants = useMemo(() => sortVariantsForBuyerDisplay(pickerVariants), [pickerVariants]);
  const showSpotSearch = !isRandom && isPlayerBreak && variants.length > 12;
  const filteredVariants = useMemo(() => {
    const q = spotSearch.trim().toLowerCase();
    if (!q) return variants;
    return variants.filter((v) => v.label.toLowerCase().includes(q));
  }, [spotSearch, variants]);
  const selectedVariants = useMemo(
    () => variants.filter((v) => selectedIds.includes(v.id)),
    [selectedIds, variants],
  );
  const selected = selectedVariants[0] ?? null;
  const selectionCount = selectedVariants.length;
  const spotSummary = useMemo(() => summarizeSpots(variants), [variants]);
  const pickerBase = variantBuyerSelectLabel(item.salesFormat, isRandom);
  const pickerTitle =
    selectionCount === 0
      ? pickerBase
      : selectionCount === 1
        ? `${pickerBase}: ${selectedVariants[0]!.label}`
        : `${pickerBase}: ${selectionCount} selected`;
  const unitPrice = selected?.priceUsd ?? spotSummary.fromPrice ?? 0;

  const spotPrice = useMemo(() => {
    if (selectedVariants.length === 0) return 0;
    return Math.round(selectedVariants.reduce((sum, v) => sum + v.priceUsd, 0) * 100) / 100;
  }, [selectedVariants]);

  const totalDue = checkoutPreview?.chargeNowUsd ?? spotPrice;
  const chargeNow = totalDue;

  useEffect(() => {
    if (!open) {
      setSelectedIds([]);
      setError(null);
      setBusy(false);
      setCheckoutPreview(null);
      setPreviewLoading(false);
      setSpotSearch("");
      return;
    }
    if (isRandom) {
      const available = variants.find((v) => variantIsAvailable(v));
      if (available) setSelectedIds([available.id]);
      return;
    }
    if (
      initialVariantId &&
      selectedIds.length === 0 &&
      variants.some((v) => v.id === initialVariantId && variantIsAvailable(v))
    ) {
      setSelectedIds([initialVariantId]);
      return;
    }
    setSelectedIds((prev) => {
      const next = prev.filter((id) => variants.some((v) => v.id === id && variantIsAvailable(v)));
      return next.length === prev.length ? prev : next;
    });
  }, [open, isRandom, variants, initialVariantId]);

  const toggleSpot = (variantId: string) => {
    if (isRandom) return;
    setSelectedIds((prev) => {
      if (prev.includes(variantId)) return prev.filter((id) => id !== variantId);
      return [...prev, variantId];
    });
    setError(null);
  };

  useEffect(() => {
    if (!open || !walletReady || spotPrice <= 0) {
      setCheckoutPreview(null);
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    void fetchLiveVariantCheckoutPreview({
      liveRoomId,
      itemId: item.id,
      itemPriceUsd: spotPrice,
    })
      .then((preview) => {
        if (!cancelled) setCheckoutPreview(preview);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item.id, liveRoomId, open, spotPrice, walletReady]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || busy) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose, open]);

  if (!open || !isVariantSalesFormat(item.salesFormat) || variants.length === 0) return null;

  const checkout = async () => {
    if (selectedVariants.length === 0) {
      setError(`Select ${isDivisionBreak ? "a division" : "a team"} first.`);
      return;
    }
    if (selectedVariants.some((v) => !variantIsAvailable(v))) {
      setError("One or more spots were just taken. Update your selection.");
      return;
    }
    if (!walletReady) {
      onWalletRequired();
      return;
    }
    setBusy(true);
    setError(null);
    const useBatch = !isRandom && selectedVariants.length >= 2;
    const celebrationLabel = useBatch
      ? formatBatchSpotCelebrationLabel(selectedVariants.map((v) => v.label))
      : selectedVariants[0]!.label;
    const purchasedPayload = {
      itemId: item.id,
      variantId: selectedVariants[0]!.id,
      quantity: selectedVariants.length,
      label: celebrationLabel,
      amountUsd: checkoutPreview?.chargeNowUsd ?? spotPrice,
    };
    try {
      const res = useBatch
        ? await purchaseLiveItemVariantBatch({
            liveRoomId,
            itemId: item.id,
            variantIds: selectedVariants.map((v) => v.id),
            idempotencyKey: createLiveVariantBatchPurchaseIdempotencyKey(
              selectedVariants.map((v) => v.id),
            ),
          })
        : await purchaseLiveItemVariant({
            liveRoomId,
            itemId: item.id,
            variantId: selectedVariants[0]!.id,
            quantity: 1,
            idempotencyKey: createLiveVariantPurchaseIdempotencyKey(selectedVariants[0]!.id),
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
          ...purchasedPayload,
          label: res.labels?.length ? formatBatchSpotCelebrationLabel(res.labels) : celebrationLabel,
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
        const synced =
          useBatch && res.batchId
            ? await syncLiveItemVariantPurchaseBatch({
                liveRoomId,
                itemId: item.id,
                batchId: res.batchId,
              })
            : await syncLiveItemVariantPurchase({
                liveRoomId,
                itemId: item.id,
                variantId: selectedVariants[0]!.id,
                purchaseId: res.purchaseId,
              });
        if (synced.ok && "paid" in synced && synced.paid) {
          onPurchased?.(purchasedPayload);
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
    <div className="pointer-events-none fixed inset-0 z-[55] flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Close checkout"
        className="pointer-events-auto absolute inset-0 bg-black/48"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={pickerTitle}
        className="pointer-events-auto relative z-10 flex max-h-[min(72vh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#0b0b10] shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.06] px-4 pb-2 pt-3">
          <div>
            <h2 className="text-lg font-black text-white">{pickerBase}</h2>
            <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-zinc-500">
              <span aria-hidden>🔒</span>
              Secure checkout · encrypted by Stripe
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.06] px-3 text-xs font-bold text-zinc-200 hover:bg-white/[0.1] hover:text-white"
          >
            <span aria-hidden className="text-base leading-none">
              ×
            </span>
            Close
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
          </div>

          <div className="mt-4">
            <p className="text-sm font-black text-white">{pickerTitle}</p>
            <p className="mt-0.5 text-[11px] font-semibold text-zinc-500">
              {isRandom
                ? "Hold to buy — Vault Reveal assigns your spot from what's left"
                : selectionCount > 0
                  ? walletReady
                    ? selectionCount > 1
                      ? `Hold to buy to pay ${fmtMoney(chargeNow)} for ${selectionCount} spots — shipping and tax below`
                      : `Hold to buy to pay ${fmtMoney(chargeNow)} now — spot, shipping, and tax below`
                    : `Confirm ${spotNounSingular}, then hold to buy to checkout`
                  : `Tap ${spotNoun} to multi-select, then checkout`}
            </p>
            {!isRandom ? (
              <>
                {showSpotSearch ? (
                  <input
                    type="search"
                    value={spotSearch}
                    onChange={(e) => setSpotSearch(e.target.value)}
                    placeholder="Search players…"
                    className="mt-2 w-full rounded-lg border border-white/10 bg-[#0c0c10] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
                    aria-label="Search players"
                  />
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {filteredVariants.map((v) => (
                    <VariantPill
                      key={v.id}
                      variant={v}
                      selected={selectedIds.includes(v.id)}
                      onSelect={() => {
                        if (!variantIsAvailable(v)) return;
                        toggleSpot(v.id);
                      }}
                    />
                  ))}
                </div>
                {showSpotSearch && filteredVariants.length === 0 ? (
                  <p className="mt-2 text-[11px] font-semibold text-zinc-500">No players match that search.</p>
                ) : null}
              </>
            ) : (
              <div className="mt-3 rounded-xl border border-amber-400/25 bg-gradient-to-r from-amber-500/10 to-zinc-950/80 px-4 py-3 text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-200/90">Vault Reveal</p>
                <p className="mt-1 text-sm font-bold text-white">
                  {spotSummary.available} {spotNoun} left in the pool
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 space-y-2 rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2 text-[11px]">
            <SummaryRow
              label={selectionCount > 1 ? `Spot prices (${selectionCount})` : "Spot price"}
              value={selectionCount > 0 ? fmtMoney(spotPrice) : "—"}
            />
            <SummaryRow
              label="Shipping"
              value={
                !walletReady
                  ? "Add shipping in Vault Wallet"
                  : previewLoading && !checkoutPreview
                    ? "Calculating…"
                    : checkoutPreview?.shippingDisplay ?? "Calculated by destination"
              }
            />
            <SummaryRow label="Payment" value={walletReady ? "Saved card in Vault Wallet" : "Add a card in Vault Wallet"} />
            <SummaryRow
              label="Taxes"
              value={
                !walletReady
                  ? "Add address to estimate"
                  : previewLoading && !checkoutPreview
                    ? "Calculating…"
                    : checkoutPreview?.taxDisplay ?? "Calculated at checkout"
              }
            />
          </div>
          {checkoutPreview?.taxNote ? (
            <p className="mt-2 text-center text-[10px] font-semibold text-zinc-500">{checkoutPreview.taxNote}</p>
          ) : null}

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
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-zinc-500">Total due</p>
            <p className="font-mono text-2xl font-black text-amber-300">{selectionCount > 0 ? fmtMoney(totalDue) : "—"}</p>
          </div>
          <div className="min-w-0 flex-1">
            <HoldToBuyButton
              label={
                selectionCount > 0
                  ? isRandom
                    ? `Hold to buy · vault reveal · ${fmtMoney(chargeNow)}`
                    : selectionCount > 1
                      ? `Hold to buy · ${selectionCount} spots · ${fmtMoney(chargeNow)}`
                      : `Hold to buy · ${fmtMoney(chargeNow)}`
                  : isRandom
                    ? "Hold to buy"
                    : "Select spots"
              }
              disabled={selectionCount === 0 || allSold}
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
      <span className="w-[7.5rem] shrink-0 font-bold text-zinc-500">{label}</span>
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
          Pinned
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
        <span className="mt-0.5 block truncate text-[9px] font-semibold text-emerald-300/80">
          {formatSoldSpotBuyerLabel(variant.buyerUsername)}
        </span>
      )}
    </button>
  );
}
