"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  LIVE_TIP_MAX_USD,
  LIVE_TIP_MIN_USD,
  LIVE_TIP_PRESET_AMOUNTS_USD,
  fetchLiveBuyerPaymentSession,
  fetchLiveTipPaymentMethods,
  formatLiveTipPaymentMethodLabel,
  sendLiveTipWithSavedCard,
  setLiveBuyerPaymentMethod,
  type LiveTipPaymentMethodRow,
} from "@/lib/live-tip-client";

type LiveTipSheetProps = {
  open: boolean;
  onClose: () => void;
  liveRoomId: string;
  paymentMethodId?: string | null;
  onPaymentMethodIdChange?: (id: string | null) => void;
  onSuccess?: () => void;
  onError?: (message: string) => void;
};

export function LiveTipSheet({
  open,
  onClose,
  liveRoomId,
  paymentMethodId,
  onPaymentMethodIdChange,
  onSuccess,
  onError,
}: LiveTipSheetProps) {
  const [amountUsd, setAmountUsd] = useState<number>(10);
  const [customAmount, setCustomAmount] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingPm, setLoadingPm] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<LiveTipPaymentMethodRow[]>([]);
  const [selectedPmId, setSelectedPmId] = useState<string | null>(paymentMethodId ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const refreshPaymentMethod = useCallback(async () => {
    if (!open) return;
    setLoadingPm(true);
    try {
      const [session, pmRes] = await Promise.all([
        fetchLiveBuyerPaymentSession(liveRoomId),
        fetchLiveTipPaymentMethods(),
      ]);
      setPaymentMethods(pmRes);
      const nextId =
        paymentMethodId?.trim() ||
        session?.activePaymentMethodId?.trim() ||
        pmRes.find((pm) => pm.isDefault)?.id ||
        pmRes[0]?.id ||
        null;
      setSelectedPmId(nextId);
      onPaymentMethodIdChange?.(nextId);
    } finally {
      setLoadingPm(false);
    }
  }, [liveRoomId, onPaymentMethodIdChange, open, paymentMethodId]);

  useEffect(() => {
    if (!open) return;
    setAmountUsd(10);
    setCustomAmount("");
    setMessage("");
    setBusy(false);
    setPickerOpen(false);
    void refreshPaymentMethod();
  }, [open, liveRoomId, refreshPaymentMethod]);

  useEffect(() => {
    if (paymentMethodId?.trim()) setSelectedPmId(paymentMethodId.trim());
  }, [paymentMethodId]);

  const pickMethod = useCallback(
    async (pm: LiveTipPaymentMethodRow) => {
      setSelectedPmId(pm.id);
      onPaymentMethodIdChange?.(pm.id);
      setPickerOpen(false);
      try {
        await setLiveBuyerPaymentMethod(liveRoomId, pm.id);
      } catch (e) {
        onError?.(e instanceof Error ? e.message : "Could not update payment method.");
      }
    },
    [liveRoomId, onError, onPaymentMethodIdChange],
  );

  const submit = useCallback(async () => {
    const custom = customAmount.trim() ? Number(customAmount) : NaN;
    const finalAmount = customAmount.trim() ? custom : amountUsd;
    if (!Number.isFinite(finalAmount) || finalAmount < LIVE_TIP_MIN_USD || finalAmount > LIVE_TIP_MAX_USD) {
      onError?.(`Enter a tip between $${LIVE_TIP_MIN_USD} and $${LIVE_TIP_MAX_USD}.`);
      return;
    }
    if (!selectedPmId?.trim()) {
      onError?.("Add a saved payment method in Vault Wallet before tipping.");
      return;
    }
    setBusy(true);
    try {
      await sendLiveTipWithSavedCard(liveRoomId, {
        amountUsd: finalAmount,
        message: message.trim() || undefined,
        paymentMethodId: selectedPmId,
      });
      onSuccess?.();
      onClose();
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Could not send tip.");
      setBusy(false);
    }
  }, [amountUsd, customAmount, liveRoomId, message, onClose, onError, onSuccess, selectedPmId]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 p-3 sm:items-center"
      role="dialog"
      aria-modal
      aria-labelledby="live-tip-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.12] bg-[#111114] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
          <h2 id="live-tip-title" className="text-base font-bold text-zinc-100">
            Send a tip
          </h2>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg border border-white/12 px-2.5 py-1 text-xs font-semibold text-zinc-400 hover:bg-white/[0.06] disabled:opacity-50"
          >
            Close
          </button>
        </div>
        <div className="space-y-4 p-4">
          <p className="text-xs leading-relaxed text-zinc-500">
            Tips use your Vault Wallet saved card for this room. Get Vaulted does not take a platform fee from tips.
          </p>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Payment method</p>
            <button
              type="button"
              disabled={busy || loadingPm}
              onClick={() => {
                if (paymentMethods.length > 1) setPickerOpen((v) => !v);
              }}
              className="mt-2 flex w-full items-center gap-2 rounded-xl border border-white/[0.1] bg-black/30 px-3 py-2.5 text-left disabled:opacity-50"
            >
              <span className="flex-1 text-sm font-bold text-zinc-200">
                {loadingPm ? "Loading…" : formatLiveTipPaymentMethodLabel(paymentMethods, selectedPmId)}
              </span>
              {paymentMethods.length > 1 ? (
                <span className="text-xs font-bold text-gold-bright">{pickerOpen ? "Done" : "Change"}</span>
              ) : (
                <Link href="/account/payment-methods" className="text-xs font-bold text-gold-bright hover:underline">
                  Wallet
                </Link>
              )}
            </button>
            {pickerOpen ? (
              <div className="mt-2 space-y-1.5">
                {paymentMethods.map((pm) => (
                  <button
                    key={pm.id}
                    type="button"
                    disabled={busy}
                    onClick={() => void pickMethod(pm)}
                    className={`flex w-full rounded-xl border px-3 py-2.5 text-left text-sm font-bold transition ${
                      pm.id === selectedPmId
                        ? "border-gold/50 bg-gold/10 text-gold-bright"
                        : "border-white/10 bg-black/25 text-zinc-300 hover:border-white/20"
                    }`}
                  >
                    {formatLiveTipPaymentMethodLabel(paymentMethods, pm.id)}
                  </button>
                ))}
                <Link
                  href="/account/payment-methods"
                  className="block rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm font-bold text-gold-bright hover:border-white/20"
                >
                  Manage in Vault Wallet
                </Link>
              </div>
            ) : null}
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Amount</p>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {LIVE_TIP_PRESET_AMOUNTS_USD.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setAmountUsd(amt);
                    setCustomAmount("");
                  }}
                  className={`rounded-xl border px-2 py-2.5 text-sm font-bold tabular-nums transition ${
                    !customAmount && amountUsd === amt
                      ? "border-gold/50 bg-gold/15 text-gold-bright"
                      : "border-white/10 bg-black/30 text-zinc-300 hover:border-white/20"
                  }`}
                >
                  ${amt}
                </button>
              ))}
            </div>
            <label className="mt-3 block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Custom</span>
              <input
                type="number"
                min={LIVE_TIP_MIN_USD}
                max={LIVE_TIP_MAX_USD}
                step="0.01"
                value={customAmount}
                disabled={busy}
                onChange={(e) => setCustomAmount(e.target.value)}
                placeholder={`$${LIVE_TIP_MIN_USD}–$${LIVE_TIP_MAX_USD}`}
                className="mt-1 w-full rounded-xl border border-white/[0.1] bg-black/50 px-3 py-2.5 text-sm text-white outline-none focus:border-gold/40"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Message (optional)</span>
            <textarea
              value={message}
              disabled={busy}
              onChange={(e) => setMessage(e.target.value.slice(0, 280))}
              rows={2}
              placeholder="Say thanks or hype the room"
              className="mt-1 w-full resize-none rounded-xl border border-white/[0.1] bg-black/50 px-3 py-2.5 text-sm text-white outline-none focus:border-gold/40"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="flex min-h-11 w-full items-center justify-center rounded-xl bg-gradient-to-r from-gold to-gold-bright text-sm font-black text-zinc-950 transition hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send tip"}
          </button>
        </div>
      </div>
    </div>
  );
}
