"use client";

import { useCallback, useState } from "react";
import Link from "next/link";

type ShipTo = {
  shipRecipientName: string;
  shipAddress: string;
  shipCity: string;
  shipState: string;
  shipZip: string;
  shipCountry: string;
};

type Props = {
  orderId: string;
  initialShipTo: ShipTo;
  canUpdateFromWallet: boolean;
};

export function BuyerOrderShipToPanel({ orderId, initialShipTo, canUpdateFromWallet }: Props) {
  const [shipTo, setShipTo] = useState(initialShipTo);
  const [canUpdate, setCanUpdate] = useState(canUpdateFromWallet);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyFromWallet = useCallback(async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/shipping-from-wallet`, {
        method: "POST",
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        updated?: boolean;
        shipTo?: ShipTo;
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : "Could not update shipping address.");
        if (j.code === "LABEL_EXISTS" || j.code === "ALREADY_SHIPPED" || j.code === "TERMINAL") {
          setCanUpdate(false);
        }
        return;
      }
      if (j.shipTo) setShipTo(j.shipTo);
      setMessage(
        j.updated
          ? "Ship-to updated from your Wallet address."
          : "Order already matches your Wallet address.",
      );
    } finally {
      setBusy(false);
    }
  }, [orderId]);

  return (
    <div className="mt-6 rounded-2xl border border-white/[0.08] bg-[#0a0a0d] p-6">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Ship to</p>
      <p className="mt-3 text-sm text-zinc-200">
        {shipTo.shipRecipientName}
        <br />
        {shipTo.shipAddress}
        <br />
        {shipTo.shipCity}, {shipTo.shipState} {shipTo.shipZip}
        <br />
        {shipTo.shipCountry}
      </p>
      {canUpdate ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void applyFromWallet()}
            className="inline-flex h-10 items-center justify-center rounded-full border border-gold/35 px-4 text-xs font-semibold text-gold-bright transition hover:bg-gold/10 disabled:opacity-50"
          >
            {busy ? "Updating…" : "Update from Wallet"}
          </button>
          <Link href="/account/payment-methods#wallet-shipping" className="text-xs font-semibold text-zinc-400 hover:text-zinc-200">
            Edit Wallet address
          </Link>
        </div>
      ) : (
        <p className="mt-3 text-xs text-zinc-500">
          Address is locked after a shipping label is created or the order ships.
        </p>
      )}
      {message ? <p className="mt-3 text-xs text-emerald-400/90">{message}</p> : null}
      {error ? <p className="mt-3 text-xs text-red-400/90">{error}</p> : null}
    </div>
  );
}
