"use client";

import type { LiveShowCarrierPreference, LiveShowShippingMode } from "@/lib/live-show-shipping-terms";
import {
  DEFAULT_LIVE_SHOW_SHIPPING_CAP_CENTS,
  sellerCappedShippingSummary,
} from "@/lib/live-show-shipping-terms";

export type PlatformShippingProfileOption = {
  id: string;
  slug: string;
  name: string;
};

export type SellerShippingProfileOption = {
  id: string;
  sourceSlug: string;
  name: string;
  isDefault?: boolean;
};

export type LiveShowShippingSettingsValue = {
  shippingMode: LiveShowShippingMode;
  defaultSellerShippingProfileId: string;
  defaultShippingProfileId: string;
  shippingCapCents: number | null;
  carrierPreference: LiveShowCarrierPreference;
  bundleEligiblePurchases: boolean;
  sellerPaysOverCap: boolean;
  /** Legacy booleans kept for API compatibility */
  shippingCapEnabled: boolean;
  freeShippingEnabled: boolean;
};

type Props = {
  sellerProfiles: SellerShippingProfileOption[];
  platformProfiles?: PlatformShippingProfileOption[];
  value: LiveShowShippingSettingsValue;
  onChange: (next: LiveShowShippingSettingsValue) => void;
  compact?: boolean;
  disabled?: boolean;
};

function capDollarsFromCents(cents: number | null): string {
  if (cents == null || !Number.isFinite(cents)) {
    return (DEFAULT_LIVE_SHOW_SHIPPING_CAP_CENTS / 100).toFixed(2);
  }
  return (cents / 100).toFixed(2);
}

function centsFromDollarsInput(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function syncLegacyFlags(next: LiveShowShippingSettingsValue): LiveShowShippingSettingsValue {
  return {
    ...next,
    shippingCapEnabled: next.shippingMode === "capped",
    freeShippingEnabled: next.shippingMode === "free",
    shippingCapCents:
      next.shippingMode === "capped"
        ? next.shippingCapCents ?? DEFAULT_LIVE_SHOW_SHIPPING_CAP_CENTS
        : null,
  };
}

export function defaultLiveShowShippingSettingsValue(): LiveShowShippingSettingsValue {
  return syncLegacyFlags({
    shippingMode: "capped",
    defaultSellerShippingProfileId: "",
    defaultShippingProfileId: "",
    shippingCapCents: DEFAULT_LIVE_SHOW_SHIPPING_CAP_CENTS,
    carrierPreference: "best_rate",
    bundleEligiblePurchases: true,
    sellerPaysOverCap: true,
    shippingCapEnabled: true,
    freeShippingEnabled: false,
  });
}

export function LiveShowShippingSettingsFields({
  sellerProfiles,
  platformProfiles = [],
  value,
  onChange,
  compact = false,
  disabled = false,
}: Props) {
  const labelClass = compact
    ? "text-[10px] font-bold uppercase tracking-wide text-zinc-500"
    : "text-xs font-semibold text-zinc-400";

  const patch = (partial: Partial<LiveShowShippingSettingsValue>) =>
    onChange(syncLegacyFlags({ ...value, ...partial }));

  const profileOptions =
    sellerProfiles.length > 0
      ? sellerProfiles
      : platformProfiles.map((p) => ({ id: p.id, sourceSlug: p.slug, name: p.name }));

  return (
    <div className={`space-y-3 ${compact ? "" : "rounded-xl border border-white/[0.08] bg-black/30 p-3"}`}>
      <div>
        <p className={labelClass}>Buyer shipping mode</p>
        <div className="mt-2 space-y-1.5">
          {(
            [
              ["calculated", "Calculated shipping"],
              ["capped", `Capped shipping — $${capDollarsFromCents(DEFAULT_LIVE_SHOW_SHIPPING_CAP_CENTS)} max per buyer for this show`],
              ["free", "Free shipping"],
            ] as const
          ).map(([mode, label]) => (
            <label key={mode} className="flex items-start gap-2 text-sm text-zinc-200">
              <input
                type="radio"
                name="live-shipping-mode"
                disabled={disabled}
                checked={value.shippingMode === mode}
                onChange={() => patch({ shippingMode: mode })}
                className="mt-1"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        {value.shippingMode === "capped" ? (
          <p className="mt-2 text-[11px] text-zinc-400">{sellerCappedShippingSummary(value.shippingCapCents)}</p>
        ) : null}
      </div>

      {value.shippingMode === "capped" ? (
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
            onChange={(e) => patch({ shippingCapCents: centsFromDollarsInput(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-2.5 py-2 text-sm text-white"
          />
        </div>
      ) : null}

      <div>
        <p className={labelClass}>Carrier preference</p>
        <div className="mt-2 flex flex-wrap gap-3 text-sm text-zinc-200">
          {(
            [
              ["usps", "USPS"],
              ["ups", "UPS"],
              ["best_rate", "Best Rate"],
            ] as const
          ).map(([pref, label]) => (
            <label key={pref} className="flex items-center gap-1.5">
              <input
                type="radio"
                name="live-carrier-pref"
                disabled={disabled}
                checked={value.carrierPreference === pref}
                onChange={() => patch({ carrierPreference: pref })}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="live-shipping-profile">
          Default shipping profile for this show
        </label>
        <select
          id="live-shipping-profile"
          disabled={disabled}
          value={value.defaultSellerShippingProfileId || value.defaultShippingProfileId}
          onChange={(e) => {
            const id = e.target.value;
            if (sellerProfiles.some((p) => p.id === id)) {
              patch({ defaultSellerShippingProfileId: id, defaultShippingProfileId: "" });
            } else {
              patch({ defaultShippingProfileId: id, defaultSellerShippingProfileId: "" });
            }
          }}
          className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-2.5 py-2 text-sm text-white"
        >
          <option value="">Select a profile…</option>
          {profileOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {"isDefault" in p && p.isDefault ? " (default)" : ""}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm text-zinc-200">
        <input
          type="checkbox"
          disabled={disabled}
          checked={value.bundleEligiblePurchases}
          onChange={(e) => patch({ bundleEligiblePurchases: e.target.checked })}
          className="rounded border-white/20"
        />
        Bundle eligible purchases in this show (respect each profile&apos;s parcel rules)
      </label>

      {value.shippingMode === "capped" ? (
        <label className="flex items-center gap-2 text-sm text-zinc-200">
          <input
            type="checkbox"
            disabled={disabled}
            checked={value.sellerPaysOverCap}
            onChange={(e) => patch({ sellerPaysOverCap: e.target.checked })}
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
