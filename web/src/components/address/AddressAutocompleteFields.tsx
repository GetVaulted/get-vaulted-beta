"use client";

import { useEffect, useRef, useState } from "react";
import {
  retrieveAutocompleteAddress,
  searchAddressAutocomplete,
  type AddressAutocompleteSuggestion,
  type AddressAutocompleteValues,
} from "@/lib/address-api-client";
import { toUserFacingErrorMessage } from "@/lib/user-facing-error-message";

export type { AddressAutocompleteValues };

type FieldKey = keyof AddressAutocompleteValues;

type Props = {
  values: AddressAutocompleteValues;
  onChange: (field: FieldKey, value: string) => void;
  onResolved?: (values: AddressAutocompleteValues) => void;
  disabled?: boolean;
  line1Label?: string;
  className?: string;
  inputClassName?: string;
  labelClassName?: string;
  showCountry?: boolean;
  countryReadOnly?: boolean;
  showLine2?: boolean;
};

export function AddressAutocompleteFields({
  values,
  onChange,
  onResolved,
  disabled = false,
  line1Label = "Address line 1",
  className = "grid gap-3 sm:grid-cols-2",
  inputClassName = "mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-400/40",
  labelClassName = "block text-[11px] font-semibold text-zinc-400",
  showCountry = true,
  countryReadOnly = false,
  showLine2 = true,
}: Props) {
  const [suggestions, setSuggestions] = useState<AddressAutocompleteSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const containerRef = useRef<string | undefined>(undefined);
  const debounceRef = useRef<number | null>(null);
  const pauseSearchRef = useRef(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const resolvedSectionRef = useRef<HTMLDivElement | null>(null);
  const line1InputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (pauseSearchRef.current) {
      setSuggestions([]);
      setOpen(false);
      setBusy(false);
      return;
    }
    const q = values.line1.trim();
    if (q.length < 3) {
      setSuggestions([]);
      setOpen(false);
      setHint(null);
      return;
    }

    debounceRef.current = window.setTimeout(() => {
      void (async () => {
        setBusy(true);
        try {
          const res = await searchAddressAutocomplete(q, values.country, containerRef.current);
          setSuggestions(res.suggestions);
          setOpen(res.suggestions.length > 0);
          // When autocomplete just isn't enabled in this environment, degrade silently to plain
          // manual entry instead of surfacing an internal "requires Shippo" config message.
          setHint(null);
        } catch {
          setSuggestions([]);
          setOpen(false);
        } finally {
          setBusy(false);
        }
      })();
    }, 280);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [values.line1, values.country]);

  const applyResolved = (resolved: AddressAutocompleteValues) => {
    pauseSearchRef.current = true;
    containerRef.current = undefined;
    setOpen(false);
    setSuggestions([]);
    setBusy(false);
    setHint(null);
    line1InputRef.current?.blur();
    onChange("line1", resolved.line1);
    onChange("line2", resolved.line2);
    onChange("city", resolved.city);
    onChange("state", resolved.state);
    onChange("postalCode", resolved.postalCode);
    onChange("country", resolved.country);
    onResolved?.(resolved);
    window.requestAnimationFrame(() => {
      resolvedSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const pickSuggestion = async (suggestion: AddressAutocompleteSuggestion) => {
    if (suggestion.isContainer) {
      containerRef.current = suggestion.id;
      const res = await searchAddressAutocomplete(values.line1.trim(), values.country, suggestion.id);
      setSuggestions(res.suggestions);
      setOpen(res.suggestions.length > 0);
      return;
    }

    setOpen(false);
    setSuggestions([]);
    pauseSearchRef.current = true;
    setBusy(true);
    try {
      const resolved = await retrieveAutocompleteAddress(suggestion.id);
      applyResolved(resolved);
    } catch (e) {
      pauseSearchRef.current = false;
      setHint(toUserFacingErrorMessage(e instanceof Error ? e.message : null, "Could not load that address."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={className}>
      <div ref={wrapRef} className="relative sm:col-span-2">
        <label className={labelClassName}>
          {line1Label}
          <input
            ref={line1InputRef}
            value={values.line1}
            disabled={disabled}
            onChange={(e) => {
              pauseSearchRef.current = false;
              containerRef.current = undefined;
              onChange("line1", e.target.value);
            }}
            onFocus={() => {
              if (pauseSearchRef.current) return;
              if (suggestions.length) setOpen(true);
            }}
            autoComplete="address-line1"
            className={inputClassName}
          />
        </label>
        {busy ? <p className="mt-1 text-[10px] text-zinc-500">Searching addresses…</p> : null}
        {hint ? <p className="mt-1 text-[10px] text-zinc-500">{hint}</p> : null}
        {open && suggestions.length ? (
          <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-white/12 bg-[#101014] py-1 shadow-2xl">
            {suggestions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm text-zinc-100 hover:bg-white/8"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void pickSuggestion(s)}
                >
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="contents sm:contents">
      {showLine2 ? (
        <label className={`${labelClassName} sm:col-span-2`}>
          Address line 2 (optional)
          <input
            value={values.line2}
            disabled={disabled}
            onChange={(e) => onChange("line2", e.target.value)}
            autoComplete="address-line2"
            className={inputClassName}
          />
        </label>
      ) : null}
      <div ref={resolvedSectionRef} className="contents sm:contents">
      <label className={labelClassName}>
        City
        <input
          value={values.city}
          disabled={disabled}
          onChange={(e) => onChange("city", e.target.value)}
          autoComplete="address-level2"
          className={inputClassName}
        />
      </label>
      <label className={labelClassName}>
        State / region
        <input
          value={values.state}
          disabled={disabled}
          onChange={(e) => onChange("state", e.target.value)}
          autoComplete="address-level1"
          className={inputClassName}
        />
      </label>
      <label className={labelClassName}>
        Postal code
        <input
          value={values.postalCode}
          disabled={disabled}
          onChange={(e) => onChange("postalCode", e.target.value)}
          autoComplete="postal-code"
          className={inputClassName}
        />
      </label>
      {showCountry ? (
        <label className={labelClassName}>
          Country (ISO)
          <input
            value={values.country}
            disabled={disabled || countryReadOnly}
            readOnly={countryReadOnly}
            onChange={(e) => onChange("country", e.target.value.toUpperCase().slice(0, 2))}
            maxLength={2}
            autoComplete="country"
            className={inputClassName}
          />
        </label>
      ) : null}
      </div>
      </div>
    </div>
  );
}
