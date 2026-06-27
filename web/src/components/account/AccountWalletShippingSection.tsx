"use client";

import { useCallback, useEffect, useState } from "react";
import {
  buildShippingAddressPayload,
  formatAddressApiError,
  validateShippingAddress,
  type AddressValidateResponse,
} from "@/lib/address-api-client";
import { AddressAutocompleteFields } from "@/components/address/AddressAutocompleteFields";

type AddrRow = {
  id: string;
  type?: string;
  name: string;
  fullName: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault?: boolean;
  isVerified?: boolean;
};

export function AccountWalletShippingSection() {
  const [rows, setRows] = useState<AddrRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("Shipping");
  const [fullName, setFullName] = useState("");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("US");
  const [isDefault, setIsDefault] = useState(true);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyNote, setVerifyNote] = useState<string | null>(null);
  const [verifiedReady, setVerifiedReady] = useState(false);

  const formPayload = () =>
    buildShippingAddressPayload({
      name,
      fullName,
      line1,
      line2,
      city,
      state,
      postalCode,
      country,
      isDefault,
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
    setErr(null);
    setVerifyNote(null);
    setVerifiedReady(false);
    try {
      const result = await validateShippingAddress(formPayload());
      if (result.suggested) applySuggested(result.suggested);
      if (result.corrected) {
        setVerifyNote("We updated your address to the carrier-verified format.");
      } else if (result.skipped) {
        setVerifyNote(result.message ?? "Address format looks complete.");
      } else {
        setVerifyNote("Address verified — ready to save.");
      }
      setVerifiedReady(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Address could not be verified.");
    } finally {
      setVerifyBusy(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/account/addresses", { cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as { addresses?: AddrRow[] };
      const list = Array.isArray(j.addresses) ? j.addresses.filter((a) => a.type === "shipping") : [];
      setRows(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#wallet-shipping") return;
    const id = window.setTimeout(() => {
      document.getElementById("wallet-shipping")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
    return () => window.clearTimeout(id);
  }, []);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/account/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formPayload()),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        messages?: string[];
        corrected?: boolean;
      };
      if (!res.ok) {
        setErr(formatAddressApiError(j));
        setVerifiedReady(false);
        return;
      }
      setFormOpen(false);
      setVerifyNote(null);
      setVerifiedReady(false);
      setFullName("");
      setLine1("");
      setLine2("");
      setCity("");
      setState("");
      setPostalCode("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="wallet-shipping" className="mt-12 space-y-4" aria-label="Shipping addresses">
      <div>
        <h2 className="font-display text-lg font-bold text-foreground">Shipping addresses</h2>
        <p className="mt-1 max-w-2xl text-xs text-zinc-500">
          Live shows require a ship-to on file before you can bid, buy, or claim spots. Addresses are stored on your
          profile and reused at checkout.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading addresses…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-zinc-400">No shipping address saved yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((a) => (
            <li key={a.id} className="rounded-xl border border-white/[0.08] bg-[#08080a]/90 px-4 py-3">
              <p className="text-sm font-semibold text-zinc-100">{a.fullName}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                {[a.line1, a.line2].filter(Boolean).join(", ")}
                <br />
                {a.city}, {a.state} {a.postalCode} · {a.country}
                {a.isDefault ? (
                  <span className="ml-2 rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold-bright">
                    Default
                  </span>
                ) : null}
                {a.isVerified ? (
                  <span className="ml-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-200">
                    Verified
                  </span>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      )}

      {!formOpen ? (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="inline-flex h-10 items-center justify-center rounded-full border border-white/15 px-5 text-xs font-bold uppercase tracking-wide text-gold-bright transition hover:border-gold/40 hover:bg-gold/10"
        >
          Add shipping address
        </button>
      ) : (
        <div className="rounded-2xl border border-white/[0.1] bg-[#0c0c10] p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h3 className="text-sm font-bold text-zinc-100">New shipping address</h3>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setFormOpen(false);
                setErr(null);
              }}
              className="text-xs font-semibold text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
          {err ? <p className="mt-2 whitespace-pre-line text-xs font-medium text-rose-300">{err}</p> : null}
          {verifyNote ? <p className="mt-2 text-xs font-medium text-emerald-200">{verifyNote}</p> : null}
          <p className="mt-2 text-[11px] text-zinc-500">
            Start typing your street address for suggestions, then verify before saving so labels do not fail at fulfillment.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-[11px] font-semibold text-zinc-400">
              Label
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100"
              />
            </label>
            <label className="block text-[11px] font-semibold text-zinc-400 sm:col-span-2">
              Full name
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100"
              />
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
                setVerifiedReady(false);
              }}
              inputClassName="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100"
              labelClassName="block text-[11px] font-semibold text-zinc-400"
            />
            <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300 sm:col-span-2">
              <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
              Set as default shipping address
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={verifyBusy || busy}
              onClick={() => void verify()}
              className="inline-flex h-11 items-center justify-center rounded-full border border-white/15 px-5 text-sm font-bold text-zinc-100 transition hover:border-gold/35 hover:text-gold-bright disabled:opacity-60"
            >
              {verifyBusy ? "Verifying…" : "Verify address"}
            </button>
            <button
              type="button"
              disabled={busy || verifyBusy}
              onClick={() => void submit()}
              className="inline-flex h-11 min-w-[10rem] items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-6 text-sm font-bold text-zinc-950 disabled:opacity-60"
            >
              {busy ? "Saving…" : verifiedReady ? "Save verified address" : "Save address"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
