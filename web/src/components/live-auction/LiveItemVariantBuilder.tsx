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

const FIELD_LABEL = "mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400";

function parseUsdInput(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function formatUsd(n: number) {
  return n.toFixed(2);
}

function detectActivePreset(variants: VariantDraftInput[]): Exclude<LiveItemVariantPresetId, "custom"> | null {
  if (variants.length === 0) return null;
  for (const id of Object.keys(LIVE_ITEM_VARIANT_PRESETS) as Exclude<LiveItemVariantPresetId, "custom">[]) {
    const presetLabels = LIVE_ITEM_VARIANT_PRESETS[id].options.map((o) => o.label);
    const currentLabels = variants.map((v) => v.label);
    if (presetLabels.length === currentLabels.length && presetLabels.every((l, i) => l === currentLabels[i])) {
      return id;
    }
  }
  return null;
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M4 6h12M8 6V4.5A1.5 1.5 0 0 1 9.5 3h1A1.5 1.5 0 0 1 12 4.5V6m2 0v9.5A1.5 1.5 0 0 1 12.5 17h-5A1.5 1.5 0 0 1 6 15.5V6h8Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PriceField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? formatUsd(value);

  return (
    <div className="min-w-0">
      <label htmlFor={id} className={FIELD_LABEL}>
        {label}
      </label>
      <div className="relative max-w-full">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-zinc-400">
          $
        </span>
        <input
          id={id}
          inputMode="decimal"
          value={display}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const parsed = parseUsdInput(draft ?? display);
            if (parsed != null) onChange(parsed);
            setDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          placeholder="0.00"
          className="box-border w-full max-w-full rounded-lg border border-white/12 bg-[#0c0c10] py-2 pl-6 pr-2 text-sm font-semibold tabular-nums text-zinc-100 outline-none transition focus:border-amber-400/40 focus:ring-1 focus:ring-amber-400/25"
        />
      </div>
    </div>
  );
}

function QuantityField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const bump = (delta: number) => onChange(Math.max(1, Math.min(512, value + delta)));

  return (
    <div className="min-w-0">
      <label htmlFor={id} className={FIELD_LABEL}>
        {label}
      </label>
      <div className="inline-flex w-[5.75rem] max-w-full items-stretch overflow-hidden rounded-lg border border-white/12 bg-[#0c0c10] focus-within:border-amber-400/40 focus-within:ring-1 focus-within:ring-amber-400/25">
        <button
          type="button"
          onClick={() => bump(-1)}
          disabled={value <= 1}
          className="flex h-9 w-7 shrink-0 items-center justify-center border-r border-white/10 text-sm font-bold text-zinc-400 transition hover:bg-white/[0.04] hover:text-zinc-200 disabled:opacity-30"
          aria-label={`Decrease ${label}`}
        >
          −
        </button>
        <input
          id={id}
          inputMode="numeric"
          min={1}
          max={512}
          value={value}
          onChange={(e) => {
            const n = Math.max(1, Math.min(512, Number(e.target.value.replace(/[^\d]/g, "")) || 1));
            onChange(n);
          }}
          className="box-border h-9 w-9 shrink-0 bg-transparent text-center text-sm font-semibold tabular-nums text-zinc-100 outline-none"
        />
        <button
          type="button"
          onClick={() => bump(1)}
          disabled={value >= 512}
          className="flex h-9 w-7 shrink-0 items-center justify-center border-l border-white/10 text-sm font-bold text-zinc-400 transition hover:bg-white/[0.04] hover:text-zinc-200 disabled:opacity-30"
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </div>
    </div>
  );
}

function HotSpotButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <div className="min-w-0">
      <p className={FIELD_LABEL}>Hot spot</p>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={`box-border h-9 w-full min-w-[4.5rem] rounded-lg border px-2.5 text-[10px] font-black uppercase tracking-wide transition sm:w-auto ${
          active
            ? "border-amber-400/45 bg-gradient-to-r from-amber-500/25 to-rose-500/15 text-amber-50 shadow-[0_0_16px_-4px_rgba(251,191,36,0.4)]"
            : "border-white/10 bg-white/[0.03] text-zinc-500 hover:border-white/16 hover:text-zinc-300"
        }`}
      >
        🔥 Hot
      </button>
    </div>
  );
}

function VariantRow({
  variant,
  index,
  onUpdate,
  onRemove,
}: {
  variant: VariantDraftInput;
  index: number;
  onUpdate: (patch: Partial<VariantDraftInput>) => void;
  onRemove: () => void;
}) {
  const priceId = `variant-price-${index}`;
  const qtyId = `variant-qty-${index}`;

  return (
    <article className="min-w-0 overflow-hidden rounded-xl border border-white/10 bg-[#0a0a0e] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="grid min-w-0 grid-cols-1 gap-3">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <h4 className="min-w-0 truncate text-sm font-bold text-zinc-100">{variant.label}</h4>
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] font-semibold text-zinc-400 transition hover:border-rose-400/30 hover:bg-rose-950/30 hover:text-rose-200"
            aria-label={`Remove ${variant.label}`}
          >
            <TrashIcon className="size-3.5" />
            Remove
          </button>
        </div>

        <div className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-[minmax(0,1fr)_5.75rem_auto] md:items-end">
          <div className="col-span-2 min-w-0 md:col-span-1">
            <PriceField
              id={priceId}
              label="Price USD"
              value={variant.priceUsd}
              onChange={(n) => onUpdate({ priceUsd: n })}
            />
          </div>
          <QuantityField
            id={qtyId}
            label="Quantity"
            value={variant.quantityInitial ?? 1}
            onChange={(n) => onUpdate({ quantityInitial: n })}
          />
          <HotSpotButton active={Boolean(variant.isHot)} onClick={() => onUpdate({ isHot: !variant.isHot })} />
        </div>
      </div>
    </article>
  );
}

export function LiveItemVariantBuilder({
  salesFormat,
  onSalesFormatChange,
  defaultPriceUsd,
  variants,
  onVariantsChange,
}: LiveItemVariantBuilderProps) {
  const [customLabel, setCustomLabel] = useState("");
  const [bulkPriceDraft, setBulkPriceDraft] = useState("");
  const [bulkQtyDraft, setBulkQtyDraft] = useState("");

  const showVariants = salesFormat === "variant_selection" || salesFormat === "team_break";
  const priceNum = useMemo(() => {
    const n = Number(defaultPriceUsd);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [defaultPriceUsd]);

  const activePresetId = useMemo(() => detectActivePreset(variants), [variants]);

  const applyPreset = (presetId: Exclude<LiveItemVariantPresetId, "custom">) => {
    onVariantsChange(buildVariantsFromPreset(presetId, priceNum, 1));
    setBulkPriceDraft(priceNum > 0 ? formatUsd(priceNum) : "");
    setBulkQtyDraft("1");
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

  const applyPriceToAll = () => {
    const parsed = parseUsdInput(bulkPriceDraft);
    if (parsed == null || variants.length === 0) return;
    onVariantsChange(variants.map((v) => ({ ...v, priceUsd: parsed })));
  };

  const applyQtyToAll = () => {
    const n = Math.max(1, Math.min(512, Number(bulkQtyDraft.replace(/[^\d]/g, "")) || 0));
    if (!n || variants.length === 0) return;
    onVariantsChange(variants.map((v) => ({ ...v, quantityInitial: n })));
  };

  const presetSummary = activePresetId != null ? LIVE_ITEM_VARIANT_PRESETS[activePresetId].label : null;

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Sales format</p>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
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
              className={`rounded-lg border px-2 py-2 text-[10px] font-bold transition ${
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
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Spot presets</p>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(LIVE_ITEM_VARIANT_PRESETS) as Exclude<LiveItemVariantPresetId, "custom">[]).map((id) => {
                const active = activePresetId === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => applyPreset(id)}
                    className={`rounded-lg border px-3 py-2 text-left transition ${
                      active
                        ? "border-amber-400/35 bg-amber-500/12 text-amber-50 shadow-[0_0_20px_-8px_rgba(251,191,36,0.35)]"
                        : "border-white/10 bg-black/40 text-zinc-400 hover:border-amber-400/20 hover:text-amber-100"
                    }`}
                  >
                    <span className="block text-[11px] font-black uppercase tracking-wide">
                      {LIVE_ITEM_VARIANT_PRESETS[id].label}
                      {active ? " ✓" : null}
                    </span>
                    <span className="mt-0.5 block text-[10px] font-medium text-zinc-500">
                      {LIVE_ITEM_VARIANT_PRESETS[id].options.length} spots
                    </span>
                  </button>
                );
              })}
            </div>
            {presetSummary ? (
              <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-950/20 px-3 py-2">
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Active preset</span>
                <span className="text-sm font-bold text-emerald-100">{presetSummary}</span>
                <span className="text-emerald-400" aria-hidden>
                  ✓
                </span>
              </div>
            ) : null}
          </div>

          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Add custom spot</p>
            <div className="mt-1.5 flex min-w-0 flex-col gap-2 sm:flex-row">
              <input
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="e.g. Team name or division"
                className="box-border min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0c0c10] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-400/35 focus:ring-1 focus:ring-amber-400/20"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustom();
                  }
                }}
              />
              <button
                type="button"
                onClick={addCustom}
                disabled={!customLabel.trim()}
                className="shrink-0 rounded-lg border border-amber-400/25 bg-amber-500/12 px-4 py-2 text-[11px] font-black uppercase tracking-wide text-amber-100 transition hover:bg-amber-500/20 disabled:opacity-40 sm:self-end"
              >
                Add spot
              </button>
            </div>
          </div>

          {variants.length > 1 ? (
            <div className="min-w-0 overflow-hidden rounded-xl border border-white/10 bg-[#0a0a0e] p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Quick apply to all spots</p>
              <div className="mt-3 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
                <div className="min-w-0 space-y-2">
                  <PriceField
                    id="bulk-price-all"
                    label="Price USD"
                    value={parseUsdInput(bulkPriceDraft) ?? priceNum}
                    onChange={(n) => setBulkPriceDraft(formatUsd(n))}
                  />
                  <button
                    type="button"
                    onClick={applyPriceToAll}
                    className="w-full rounded-lg border border-amber-400/30 bg-amber-500/15 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-amber-100 transition hover:bg-amber-500/25"
                  >
                    Apply price to all
                  </button>
                </div>
                <div className="min-w-0 space-y-2">
                  <QuantityField
                    id="bulk-qty-all"
                    label="Quantity"
                    value={Math.max(1, Number(bulkQtyDraft.replace(/[^\d]/g, "")) || 1)}
                    onChange={(n) => setBulkQtyDraft(String(n))}
                  />
                  <button
                    type="button"
                    onClick={applyQtyToAll}
                    className="w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-wide text-zinc-200 transition hover:bg-white/[0.08]"
                  >
                    Apply qty to all
                  </button>
                </div>
              </div>
              {presetSummary ? (
                <p className="mt-2 text-[11px] text-zinc-500">
                  Example: apply the same price to all {presetSummary.toLowerCase()} spots in one click.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="min-w-0">
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
              Spots ({variants.length})
            </p>
            <div className="space-y-3 rounded-xl border border-white/[0.08] bg-black/20 p-3">
              {variants.length === 0 ? (
                <p className="py-6 text-center text-sm text-zinc-500">
                  Choose a preset above or add custom spots to set up your break.
                </p>
              ) : (
                variants.map((v, i) => (
                  <VariantRow
                    key={`${v.label}-${i}`}
                    variant={v}
                    index={i}
                    onUpdate={(patch) => updateVariant(i, patch)}
                    onRemove={() => removeVariant(i)}
                  />
                ))
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
