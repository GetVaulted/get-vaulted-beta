"use client";

import { useState } from "react";

export type WalletShippingAddressRow = {
  id: string;
  type?: string;
  fullName: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault?: boolean;
};

type Props = {
  onSaved: (address: WalletShippingAddressRow) => void;
  onCancel?: () => void;
};

export function WalletInlineShippingForm({ onSaved, onCancel }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("US");

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type: "shipping",
          name: "Shipping",
          fullName: fullName.trim(),
          line1: line1.trim(),
          line2: line2.trim() ? line2.trim() : null,
          city: city.trim(),
          state: state.trim(),
          postalCode: postalCode.trim(),
          country: country.trim().toUpperCase().slice(0, 2) || "US",
          isDefault: true,
          isVerified: false,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; address?: WalletShippingAddressRow };
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : "Could not save address.");
        return;
      }
      if (j.address?.id) {
        onSaved(j.address);
        return;
      }
      setError("Address saved but could not refresh. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const fieldClass =
    "mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-400/40";

  return (
    <div className="space-y-3">
      {error ? <p className="text-xs font-medium text-rose-300">{error}</p> : null}
      <label className="block text-[11px] font-semibold text-zinc-400">
        Full name
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={fieldClass} />
      </label>
      <label className="block text-[11px] font-semibold text-zinc-400">
        Address line 1
        <input value={line1} onChange={(e) => setLine1(e.target.value)} className={fieldClass} />
      </label>
      <label className="block text-[11px] font-semibold text-zinc-400">
        Address line 2 (optional)
        <input value={line2} onChange={(e) => setLine2(e.target.value)} className={fieldClass} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[11px] font-semibold text-zinc-400">
          City
          <input value={city} onChange={(e) => setCity(e.target.value)} className={fieldClass} />
        </label>
        <label className="block text-[11px] font-semibold text-zinc-400">
          State
          <input value={state} onChange={(e) => setState(e.target.value)} className={fieldClass} />
        </label>
        <label className="block text-[11px] font-semibold text-zinc-400">
          ZIP
          <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className={fieldClass} />
        </label>
        <label className="block text-[11px] font-semibold text-zinc-400">
          Country
          <input value={country} onChange={(e) => setCountry(e.target.value)} maxLength={2} className={fieldClass} />
        </label>
      </div>
      <div className="flex gap-2 pt-1">
        {onCancel ? (
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="flex-1 rounded-xl border border-white/15 py-3 text-sm font-bold text-zinc-300 disabled:opacity-50"
          >
            Cancel
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className={`${onCancel ? "flex-1" : "w-full"} rounded-xl bg-amber-400 py-3 text-sm font-black text-zinc-950 disabled:opacity-60`}
        >
          {busy ? "Saving…" : "Save address"}
        </button>
      </div>
    </div>
  );
}
