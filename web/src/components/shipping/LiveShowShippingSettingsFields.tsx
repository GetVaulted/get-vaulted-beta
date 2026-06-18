"use client";

export type PlatformShippingProfileOption = {
  id: string;
  slug: string;
  name: string;
};

export type LiveShowShippingSettingsValue = {
  defaultShippingProfileId: string;
  shippingCapEnabled: boolean;
  shippingCapCents: number | null;
  freeShippingEnabled: boolean;
  sellerPaysOverCap: boolean;
};

type Props = {
  profiles: PlatformShippingProfileOption[];
  value: LiveShowShippingSettingsValue;
  onChange: (next: LiveShowShippingSettingsValue) => void;
  compact?: boolean;
  disabled?: boolean;
};

function capDollarsFromCents(cents: number | null): string {
  if (cents == null || !Number.isFinite(cents)) return "11.99";
  return (cents / 100).toFixed(2);
}

function centsFromDollarsInput(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function LiveShowShippingSettingsFields({
  profiles,
  value,
  onChange,
  compact = false,
  disabled = false,
}: Props) {
  const labelClass = compact ? "text-[10px] font-bold uppercase tracking-wide text-zinc-500" : "text-xs font-semibold text-zinc-400";

  return (
    <div className={`space-y-3 ${compact ? "" : "rounded-xl border border-white/[0.08] bg-black/30 p-3"}`}>
      <div>
        <label className={labelClass} htmlFor="live-shipping-profile">
          Default shipping profile
        </label>
        <select
          id="live-shipping-profile"
          disabled={disabled}
          value={value.defaultShippingProfileId}
          onChange={(e) => onChange({ ...value, defaultShippingProfileId: e.target.value })}
          className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-2.5 py-2 text-sm text-white"
        >
          <option value="">Auto (by category)</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm text-zinc-200">
        <input
          type="checkbox"
          disabled={disabled || value.freeShippingEnabled}
          checked={value.shippingCapEnabled}
          onChange={(e) => onChange({ ...value, shippingCapEnabled: e.target.checked })}
          className="rounded border-white/20"
        />
        Cap buyer shipping
      </label>

      {value.shippingCapEnabled && !value.freeShippingEnabled ? (
        <div>
          <label className={labelClass} htmlFor="live-shipping-cap">
            Buyer shipping cap (USD)
          </label>
          <input
            id="live-shipping-cap"
            type="number"
            min={0}
            step={0.01}
            disabled={disabled}
            value={capDollarsFromCents(value.shippingCapCents)}
            onChange={(e) =>
              onChange({
                ...value,
                shippingCapCents: centsFromDollarsInput(e.target.value),
              })
            }
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-2.5 py-2 text-sm text-white"
          />
        </div>
      ) : null}

      <label className="flex items-center gap-2 text-sm text-zinc-200">
        <input
          type="checkbox"
          disabled={disabled}
          checked={value.freeShippingEnabled}
          onChange={(e) =>
            onChange({
              ...value,
              freeShippingEnabled: e.target.checked,
              shippingCapEnabled: e.target.checked ? false : value.shippingCapEnabled,
            })
          }
          className="rounded border-white/20"
        />
        Free shipping for buyers
      </label>

      {value.shippingCapEnabled && !value.freeShippingEnabled ? (
        <label className="flex items-center gap-2 text-sm text-zinc-200">
          <input
            type="checkbox"
            disabled={disabled}
            checked={value.sellerPaysOverCap}
            onChange={(e) => onChange({ ...value, sellerPaysOverCap: e.target.checked })}
            className="rounded border-white/20"
          />
          Seller pays shipping over cap
        </label>
      ) : null}
    </div>
  );
}

export function formatShippingLiabilitySummary(args: {
  collectedCents: number;
  estimatedLabelCostCents: number;
  sellerSubsidyCents: number;
  freeShippingEnabled: boolean;
}): string {
  const collected = (args.collectedCents / 100).toFixed(2);
  const estimated = (args.estimatedLabelCostCents / 100).toFixed(2);
  if (args.freeShippingEnabled) {
    return `Free shipping — collected $${collected}, est. labels $${estimated}`;
  }
  if (args.sellerSubsidyCents > 0) {
    return `Collected $${collected} · est. labels $${estimated} · seller subsidy $${(args.sellerSubsidyCents / 100).toFixed(2)}`;
  }
  return `Collected $${collected} · est. labels $${estimated}`;
}
