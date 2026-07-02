"use client";

import { useCallback, useEffect, useState } from "react";
import { AddressAutocompleteFields } from "@/components/address/AddressAutocompleteFields";
import {
  hasCompleteSellerShipFrom,
  SELLER_SHIP_FROM_COUNTRY,
  SELLER_SHIP_FROM_COUNTRY_LABEL,
  sellerNeedsShipFromPhoneOnly,
} from "@/lib/seller-shipping-readiness";

type SellerShipFromPayload = {
  shipFromName: string | null;
  shipFromStreet: string | null;
  shipFromCity: string | null;
  shipFromState: string | null;
  shipFromZip: string | null;
  shipFromCountry: string | null;
  shipFromPhone: string | null;
};

function combineStreet(line1: string, line2: string): string {
  const a = line1.trim();
  const b = line2.trim();
  if (!b) return a;
  return `${a} ${b}`;
}

function formatSummary(s: SellerShipFromPayload): string {
  return [
    s.shipFromStreet,
    s.shipFromCity,
    s.shipFromState,
    s.shipFromZip,
    s.shipFromCountry?.trim() || SELLER_SHIP_FROM_COUNTRY,
  ]
    .filter(Boolean)
    .join(", ");
}

export function SellerShipFromSetupCard({
  onSaved,
  forceEdit,
  embedded = false,
}: {
  onSaved?: () => void;
  forceEdit?: boolean;
  /** Nested inside Seller HQ essentials card — tighter saved + edit UI. */
  embedded?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const [shipName, setShipName] = useState("");
  const [shipStreet, setShipStreet] = useState("");
  const [shipCity, setShipCity] = useState("");
  const [shipState, setShipState] = useState("");
  const [shipZip, setShipZip] = useState("");
  const [shipPhone, setShipPhone] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/account/seller", { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as {
        seller?: SellerShipFromPayload;
        shipFromAddresses?: { phone?: string | null; isDefault?: boolean }[];
      };
      const s = j.seller;
      if (!s) return;
      setShipName(s.shipFromName ?? "");
      setShipStreet(s.shipFromStreet ?? "");
      setShipCity(s.shipFromCity ?? "");
      setShipState(s.shipFromState ?? "");
      setShipZip(s.shipFromZip ?? "");
      setShipPhone(
        s.shipFromPhone ?? j.shipFromAddresses?.find((a) => a.isDefault)?.phone ?? j.shipFromAddresses?.[0]?.phone ?? "",
      );
      setEditing(!hasCompleteSellerShipFrom(s));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (forceEdit) setEditing(true);
  }, [forceEdit]);

  const sellerSnapshot: SellerShipFromPayload = {
    shipFromName: shipName,
    shipFromStreet: shipStreet,
    shipFromCity: shipCity,
    shipFromState: shipState,
    shipFromZip: shipZip,
    shipFromCountry: SELLER_SHIP_FROM_COUNTRY,
    shipFromPhone: shipPhone,
  };

  const complete = hasCompleteSellerShipFrom(sellerSnapshot);
  const phoneOnly = sellerNeedsShipFromPhoneOnly(sellerSnapshot);
  const showSaved = !editing && complete;

  const save = async () => {
    setSaveError(null);
    setSaveMsg(null);

    if (phoneOnly) {
      if (!shipPhone.trim()) {
        setSaveError("Enter a contact phone for USPS labels.");
        return;
      }
    } else {
      const required = [shipStreet, shipCity, shipState, shipZip, shipPhone].map((v) => v.trim());
      if (required.some((v) => !v)) {
        setSaveError("Please complete your address and contact phone.");
        return;
      }
    }

    setBusy(true);
    try {
      const body: Record<string, string> = {
        shipFromPhone: shipPhone.trim(),
        shipFromCountry: SELLER_SHIP_FROM_COUNTRY,
      };
      if (!phoneOnly) {
        body.shipFromName = shipName;
        body.shipFromStreet = shipStreet.trim();
        body.shipFromCity = shipCity.trim();
        body.shipFromState = shipState.trim();
        body.shipFromZip = shipZip.trim();
      }

      const res = await fetch("/api/account/seller", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; messages?: string[]; message?: string };
      if (!res.ok) {
        const primary = j.error ?? "Could not save your shipping settings.";
        const extra = Array.isArray(j.messages)
          ? j.messages.filter((m) => m.trim() && m.trim() !== primary)
          : [];
        setSaveError(extra.length ? `${primary}\n${extra.join("\n")}` : primary);
        return;
      }
      setSaveMsg(j.message ?? (phoneOnly ? "Contact phone saved." : "Shipping address saved."));
      setEditing(false);
      await load();
      onSaved?.();
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    "h-11 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-sm text-foreground outline-none transition focus:border-gold/40";

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading ship-from settings…</p>;
  }

  if (showSaved) {
    return (
      <div className={embedded ? "space-y-2" : "rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-4 py-4"}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            {!embedded ? <p className="text-sm font-semibold text-emerald-100">Ship-from ready</p> : null}
            <p className={`text-xs ${embedded ? "text-zinc-400" : "mt-1 text-emerald-200/80"}`}>
              {formatSummary(sellerSnapshot)}
            </p>
            {!embedded ? (
              <p className="mt-1 text-xs text-emerald-200/70">Phone on file for USPS labels</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg border border-white/12 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition hover:border-gold/35"
          >
            Edit
          </button>
        </div>
        {saveMsg ? <p className="text-xs text-emerald-200/90">{saveMsg}</p> : null}
      </div>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {!embedded ? (
        <div>
          <p className="text-sm font-semibold text-zinc-100">
            {phoneOnly ? "Contact phone for labels" : "Ship-from address"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {phoneOnly
              ? "Your ship-from address is already saved from onboarding. USPS requires a phone number on every label."
              : "Where packages ship from when you fulfill orders. Used for Shippo labels and buyer estimates."}
          </p>
        </div>
      ) : null}

      {phoneOnly ? (
        <div className="rounded-xl border border-white/[0.08] bg-[#08080a] px-4 py-3 text-sm text-zinc-300">
          {formatSummary(sellerSnapshot)}
        </div>
      ) : (
        <div className="grid gap-3">
          <label>
            <span className="mb-1 block text-xs font-medium text-zinc-400">Name / company</span>
            <input value={shipName} onChange={(e) => setShipName(e.target.value)} className={inputClass} autoComplete="name" />
          </label>
          <AddressAutocompleteFields
            values={{
              line1: shipStreet,
              line2: "",
              city: shipCity,
              state: shipState,
              postalCode: shipZip,
              country: SELLER_SHIP_FROM_COUNTRY,
            }}
            onChange={(field, value) => {
              if (field === "line1") setShipStreet(value);
              if (field === "city") setShipCity(value);
              if (field === "state") setShipState(value);
              if (field === "postalCode") setShipZip(value);
            }}
            onResolved={(resolved) => {
              setShipStreet(combineStreet(resolved.line1, resolved.line2));
              setShipCity(resolved.city);
              setShipState(resolved.state);
              setShipZip(resolved.postalCode);
            }}
            line1Label="Street"
            showLine2={false}
            showCountry
            countryReadOnly
            className="grid gap-3"
            inputClassName={inputClass}
            labelClassName="block text-xs font-medium text-zinc-400"
          />
          <p className="text-[11px] text-zinc-600">US-only selling during launch ({SELLER_SHIP_FROM_COUNTRY_LABEL}).</p>
        </div>
      )}

      <label>
        <span className="mb-1 block text-xs font-medium text-zinc-400">Contact phone (required for USPS labels)</span>
        <input
          value={shipPhone}
          onChange={(e) => setShipPhone(e.target.value)}
          className={inputClass}
          autoComplete="tel"
          inputMode="tel"
          placeholder="(555) 123-4567"
        />
      </label>

      {saveError ? <p className="whitespace-pre-line text-sm font-medium text-amber-200">{saveError}</p> : null}
      {saveMsg ? <p className="text-sm text-emerald-200/90">{saveMsg}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy}
          className={`inline-flex items-center justify-center disabled:opacity-50 ${
            embedded
              ? "h-9 rounded-lg bg-white/[0.06] px-4 text-xs font-semibold text-zinc-100 ring-1 ring-white/10 hover:bg-white/[0.1]"
              : "h-10 rounded-full bg-gradient-to-r from-gold to-gold-bright px-5 text-sm font-bold text-zinc-950"
          }`}
        >
          {busy ? "Saving…" : phoneOnly ? "Save phone" : "Save address"}
        </button>
        {!phoneOnly && complete ? (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="inline-flex h-10 items-center justify-center rounded-full border border-white/12 px-4 text-sm font-semibold text-zinc-300"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
