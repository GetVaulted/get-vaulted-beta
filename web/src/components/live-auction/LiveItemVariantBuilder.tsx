"use client";

import { useMemo, useState } from "react";
import {
  buildVariantsFromPreset,
  LIVE_ITEM_VARIANT_PRESETS,
  type LiveItemVariantPresetId,
  type VariantDraftInput,
} from "@/lib/live-item-variant-presets";

export type LiveItemSalesFormatDraft = "auction" | "buy_now" | "variant_selection" | "team_break";

type LiveItemVariantBuilderProps = {
  salesFormat: LiveItemSalesFormatDraft;
  onSalesFormatChange: (f: LiveItemSalesFormatDraft) => void;
  defaultPriceUsd: string;
  variants: VariantDraftInput[];
  onVariantsChange: (v: VariantDraftInput[]) => void;
};

export function LiveItemVariantBuilder({
  salesFormat,
  onSalesFormatChange,
  defaultPriceUsd,
  variants,
  onVariantsChange,
}: LiveItemVariantBuilderProps) {
  const [customLabel, setCustomLabel] = useState("");
  const showVariants = salesFormat === "variant_selection" || salesFormat === "team_break";
  const priceNum = useMemo(() => {
    const n = Number(defaultPriceUsd);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [defaultPriceUsd]);

  const applyPreset = (presetId: Exclude<LiveItemVariantPresetId, "custom">) => {
    onVariantsChange(buildVariantsFromPreset(presetId, priceNum, 1));
  };

  const addCustom = () => {
    const label = customLabel.trim();
    if (!label) return;
    onVariantsChange([
      ...variants,
      { label, priceUsd: priceNum, quantityInitial: 1, sortOrder: variants.length },
    ]);
    setCustomLabel("");
  };

  const updateVariant = (index: number, patch: Partial<VariantDraftInput>) => {
    onVariantsChange(variants.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  };

  const removeVariant = (index: number) => {
    onVariantsChange(variants.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Sales format</p>
        <div className="mt-1.5 grid grid-cols-2 gap-1">
          {(
            [
              { id: "auction" as const, label: "Auction" },
              { id: "buy_now" as const, label: "Buy now" },
              { id: "variant_selection" as const, label: "Variant selection" },
              { id: "team_break" as const, label: "Team break / spot" },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onSalesFormatChange(f.id)}
              className={`rounded-lg border px-2 py-1.5 text-[10px] font-bold transition ${
                salesFormat === f.id
                  ? "border-amber-400/35 bg-amber-500/12 text-amber-100"
                  : "border-white/10 bg-black/30 text-zinc-500 hover:border-white/16"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {showVariants ? (
        <>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Presets</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {(Object.keys(LIVE_ITEM_VARIANT_PRESETS) as Exclude<LiveItemVariantPresetId, "custom">[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => applyPreset(id)}
                  className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-zinc-400 hover:border-amber-400/25 hover:text-amber-100"
                >
                  {LIVE_ITEM_VARIANT_PRESETS[id].label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-1">
            <input
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              placeholder="Custom option label"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0c0c10] px-2 py-1.5 text-xs"
            />
            <button
              type="button"
              onClick={addCustom}
              className="shrink-0 rounded-lg border border-white/12 px-2 py-1.5 text-[10px] font-bold text-zinc-300"
            >
              Add
            </button>
          </div>

          <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-white/[0.06] bg-black/25 p-2">
            {variants.length === 0 ? (
              <p className="py-4 text-center text-[11px] text-zinc-600">Add a preset or custom options.</p>
            ) : (
              variants.map((v, i) => (
                <div key={`${v.label}-${i}`} className="flex items-center gap-1.5 rounded-lg bg-white/[0.03] px-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-zinc-200">{v.label}</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={v.priceUsd}
                    onChange={(e) => updateVariant(i, { priceUsd: Number(e.target.value) || 0 })}
                    className="w-16 rounded border border-white/10 bg-black/50 px-1 py-0.5 text-[10px] tabular-nums"
                    aria-label={`Price for ${v.label}`}
                  />
                  <input
                    type="number"
                    min={1}
                    value={v.quantityInitial ?? 1}
                    onChange={(e) => updateVariant(i, { quantityInitial: Math.max(1, Number(e.target.value) || 1) })}
                    className="w-10 rounded border border-white/10 bg-black/50 px-1 py-0.5 text-[10px] tabular-nums"
                    aria-label={`Qty for ${v.label}`}
                  />
                  <button
                    type="button"
                    onClick={() => updateVariant(i, { isHot: !v.isHot })}
                    className={`rounded px-1 py-0.5 text-[9px] font-black uppercase ${v.isHot ? "text-amber-300" : "text-zinc-600"}`}
                  >
                    {v.isHot ? "🔥" : "—"}
                  </button>
                  <button type="button" onClick={() => removeVariant(i)} className="text-[10px] text-zinc-600 hover:text-rose-300">
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
