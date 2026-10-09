"use client";

import { useMemo } from "react";
import {
  SURPRISE_SET_MAX_UNITS,
  formatOddsPercent,
  validateSurpriseSetItems,
  type SurpriseSetValidation,
} from "../../../../shared/surprise-set";

export type SurpriseSetRow = { id: string; name: string; quantity: string; msrp: string };

export function newSurpriseSetRow(): SurpriseSetRow {
  return { id: Math.random().toString(36).slice(2, 10), name: "", quantity: "1", msrp: "" };
}

export function initialSurpriseSetRows(): SurpriseSetRow[] {
  return [newSurpriseSetRow(), newSurpriseSetRow()];
}

/** Turn the form rows into the validator's input shape (blank-name rows are ignored). */
export function surpriseRowsToItems(rows: SurpriseSetRow[]) {
  return rows
    .filter((r) => r.name.trim())
    .map((r) => ({
      name: r.name,
      quantity: r.quantity.trim() === "" ? Number.NaN : Number(r.quantity),
      msrpUsd: r.msrp.trim() === "" ? Number.NaN : Number(r.msrp),
    }));
}

export function validateSurpriseRows(
  rows: SurpriseSetRow[],
  title: string,
  unitPriceUsd?: number | null,
): SurpriseSetValidation {
  return validateSurpriseSetItems(surpriseRowsToItems(rows), title, unitPriceUsd);
}

type Props = {
  rows: SurpriseSetRow[];
  onChange: (rows: SurpriseSetRow[]) => void;
  title: string;
  /** Price per unit the seller entered (checked against the lowest retail price). */
  unitPriceUsd?: number | null;
};

const inputClass =
  "w-full rounded-lg border border-white/10 bg-[#0c0c10] px-2.5 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600";

export function SurpriseSetFields({ rows, onChange, title, unitPriceUsd }: Props) {
  const result = useMemo(() => validateSurpriseRows(rows, title, unitPriceUsd), [rows, title, unitPriceUsd]);
  const anyFilled = rows.some((r) => r.name.trim());
  const totalUnits = rows.reduce((sum, r) => {
    const q = Number(r.quantity);
    return r.name.trim() && Number.isFinite(q) && q > 0 ? sum + Math.floor(q) : sum;
  }, 0);

  const update = (id: string, patch: Partial<SurpriseSetRow>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Items in this set</span>
        <span className="text-[10px] font-semibold text-zinc-500">
          {totalUnits} / {SURPRISE_SET_MAX_UNITS} units
        </span>
      </div>
      <p className="mt-1 text-[11px] text-zinc-500">
        Each unit is sold at the same price. Buyers see every item and their odds, but never the retail prices.
      </p>

      <div className="mt-2 grid grid-cols-[1fr_64px_84px_28px] gap-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        <span>Item</span>
        <span>Qty</span>
        <span>Retail $</span>
        <span />
      </div>
      <div className="mt-1 flex flex-col gap-2">
        {rows.map((r, i) => (
          <div key={r.id} className="grid grid-cols-[1fr_64px_84px_28px] items-center gap-2">
            <input
              id={`surprise-name-${r.id}`}
              value={r.name}
              onChange={(e) => update(r.id, { name: e.target.value })}
              placeholder={i === 0 ? "e.g. Charizard ex" : "Item name"}
              maxLength={48}
              className={inputClass}
              aria-label={`Item ${i + 1} name`}
            />
            <input
              id={`surprise-qty-${r.id}`}
              value={r.quantity}
              onChange={(e) => update(r.id, { quantity: e.target.value.replace(/[^\d]/g, "") })}
              inputMode="numeric"
              className={inputClass}
              aria-label={`Item ${i + 1} quantity`}
            />
            <input
              id={`surprise-msrp-${r.id}`}
              value={r.msrp}
              onChange={(e) => update(r.id, { msrp: e.target.value.replace(/[^\d.]/g, "") })}
              inputMode="decimal"
              placeholder="0.00"
              className={inputClass}
              aria-label={`Item ${i + 1} retail price`}
            />
            <button
              type="button"
              onClick={() => onChange(rows.length > 2 ? rows.filter((x) => x.id !== r.id) : rows)}
              disabled={rows.length <= 2}
              className="rounded-md text-lg leading-none text-zinc-500 hover:text-rose-300 disabled:opacity-30"
              aria-label={`Remove item ${i + 1}`}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...rows, newSurpriseSetRow()])}
        className="mt-2 rounded-lg border border-white/12 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/[0.06]"
      >
        + Add item
      </button>

      {anyFilled ? (
        result.ok ? (
          <p className="mt-3 text-[11px] text-emerald-300">
            Looks good — {result.totalUnits} units, and the top item has a {formatOddsPercent(result.topItemOdds)} chance to be drawn.
          </p>
        ) : (
          <p className="mt-3 text-[11px] text-rose-300">{result.message}</p>
        )
      ) : null}

      <ul className="mt-3 list-disc space-y-0.5 pl-4 text-[10px] text-zinc-500">
        <li>The price per unit can’t be higher than the retail price of your cheapest item, so every buyer gets at least what they paid for.</li>
        <li>Every item must be sealed, new, and in your hands now. Don’t sell more units than you have.</li>
        <li>Show each item to the camera for a couple of seconds as it’s drawn.</li>
        <li>Don’t promise a minimum value or call it a jackpot — buyers must know it’s a random draw.</li>
      </ul>
    </div>
  );
}
