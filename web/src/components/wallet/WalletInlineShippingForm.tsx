"use client";

import { useState } from "react";
import {
  buildShippingAddressPayload,
  formatAddressApiError,
  validateShippingAddress,
  type AddressValidateResponse,
} from "@/lib/address-api-client";
import { AddressAutocompleteFields } from "@/components/address/AddressAutocompleteFields";

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
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyNote, setVerifyNote] = useState<string | null>(null);

  const formPayload = () =>
    buildShippingAddressPayload({
      name: "Shipping",
      fullName,
      line1,
      line2,
      city,
      state,
      postalCode,
      country,
      isDefault: true,
    });

  const applySuggested = (suggested: NonNullable<AddressValidateResponse["suggested"]>) => {
    setFullName(suggested.fullName);
    setLine1(suggested.line1);
    setLine2(suggested.line2 ?? "");
    setCity(suggested.city);
    setState(suggested.state);
    setPostalCode(suggested.postalCode);
    setCountry(suggested.country);
  };

  const verify = async () => {
    setVerifyBusy(true);
    setError(null);
    setVerifyNote(null);
    try {
      const result = await validateShippingAddress(formPayload());
      if (result.suggested) applySuggested(result.suggested);
      setVerifyNote(
        result.corrected
          ? "Updated to carrier-verified format."
          : result.skipped
            ? (result.message ?? "Format looks complete.")
            : "Address verified.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Address could not be verified.");
    } finally {
      setVerifyBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(formPayload()),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        messages?: string[];
        address?: WalletShippingAddressRow;
      };
      if (!res.ok) {
        setError(formatAddressApiError(j));
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
      {error ? <p className="whitespace-pre-line text-xs font-medium text-rose-300">{error}</p> : null}
      {verifyNote ? <p className="text-xs font-medium text-emerald-200">{verifyNote}</p> : null}
      <label className="block text-[11px] font-semibold text-zinc-400">
        Full name
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={fieldClass} />
      </label>
      <AddressAutocompleteFields
        values={{ line1, line2, city, state, postalCode, country }}
        onChange={(field, value) => {
          if (field === "line1") setLine1(value);
          if (field === "line2") setLine2(value);
          if (field === "city") setCity(value);
          if (field === "state") setState(value);
          if (field === "postalCode") setPostalCode(value);
          if (field === "country") setCountry(value);
        }}
        className="grid grid-cols-2 gap-2"
        inputClassName={fieldClass}
        labelClassName="block text-[11px] font-semibold text-zinc-400"
      />
      <div className="flex gap-2 pt-1">
        {onCancel ? (
          <button
            type="button"
            disabled={busy || verifyBusy}
            onClick={onCancel}
            className="flex-1 rounded-xl border border-white/15 py-3 text-sm font-bold text-zinc-300 disabled:opacity-50"
          >
            Cancel
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy || verifyBusy}
          onClick={() => void verify()}
          className={`${onCancel ? "flex-1" : "w-full"} rounded-xl border border-white/15 py-3 text-sm font-bold text-zinc-200 disabled:opacity-60`}
        >
          {verifyBusy ? "Verifying…" : "Verify"}
        </button>
        <button
          type="button"
          disabled={busy || verifyBusy}
          onClick={() => void submit()}
          className={`${onCancel ? "flex-1" : "w-full"} rounded-xl bg-amber-400 py-3 text-sm font-black text-zinc-950 disabled:opacity-60`}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
