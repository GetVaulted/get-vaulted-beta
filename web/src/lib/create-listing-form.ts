/** Marketplace-wide ceiling for any single listing/offer money field. */
export const MAX_LISTING_PRICE_USD = 999999.99;
/** Listing title character cap (mirrors placeholder guidance shown in the UI). */
export const MAX_LISTING_TITLE_LENGTH = 140;
/** Listing description character cap, paired with a visible counter in the UI. */
export const MAX_LISTING_DESCRIPTION_LENGTH = 5000;

/** Strict money format: digits, optional single decimal point, at most 2 decimal places. No sign, no letters. */
const STRICT_MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;

/**
 * Parses a strictly-formatted, strictly-positive money string.
 * Unlike a "strip invalid characters then parse" approach, this rejects (returns null for)
 * any raw input containing a minus sign, letters, extra decimal points, more than 2 decimal
 * places, or an amount above MAX_LISTING_PRICE_USD — so callers never silently reinterpret
 * bad input (e.g. "-100" or "abc") as a valid positive amount.
 */
export function parseMoney(raw: string): number | null {
  const trimmed = String(raw).trim();
  if (!STRICT_MONEY_PATTERN.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_LISTING_PRICE_USD) return null;
  return n;
}

/** Same strictness as {@link parseMoney}, but allows zero (e.g. free shipping, no minimum offer). */
export function parseNonNegativeMoney(raw: string): number | null {
  const trimmed = String(raw).trim();
  if (!STRICT_MONEY_PATTERN.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0 || n > MAX_LISTING_PRICE_USD) return null;
  return n;
}

/**
 * Produces a clear, user-facing reason a money field failed validation, based on the raw
 * (unparsed) input the user typed. Callers should only show this when the corresponding
 * parseMoney/parseNonNegativeMoney call returned null for a non-blank input.
 */
export function moneyFieldErrorMessage(raw: string, opts: { label: string; allowZero: boolean }): string {
  const trimmed = String(raw).trim();
  const lowerLabel = opts.label.charAt(0).toLowerCase() + opts.label.slice(1);
  if (trimmed.includes("-")) return `${opts.label} can't be negative.`;
  if (!/^[0-9.]+$/.test(trimmed)) return `Enter ${lowerLabel} using digits only (no letters or symbols).`;
  if (!STRICT_MONEY_PATTERN.test(trimmed)) return `Enter ${lowerLabel} with at most two decimal places (e.g. 12.50).`;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return `Enter a valid ${lowerLabel}.`;
  if (n > MAX_LISTING_PRICE_USD) {
    return `${opts.label} can't exceed ${MAX_LISTING_PRICE_USD.toLocaleString("en-US", { style: "currency", currency: "USD" })}.`;
  }
  if (opts.allowZero ? n < 0 : n <= 0) {
    return opts.allowZero ? `${opts.label} can't be negative.` : `Enter ${lowerLabel} greater than $0.`;
  }
  return `Enter a valid ${lowerLabel}.`;
}

export type ShippingPreset = "raw_card" | "slab" | "small_collectible" | "custom";
export type ListingQuickDefaults = {
  category: string;
  condition: string;
  shippingPreset: ShippingPreset;
  handlingTime: string;
  format: "buy_now" | "auction";
};

export type AddAnotherPreservedValues = {
  category: string;
  condition: string;
  format: "buy_now" | "auction";
  shippingPreset: ShippingPreset;
};

export type ShippingProfileForm = {
  shippingCategory: string;
  shippingBaseWeightOz: string;
  shippingIncrementalWeightOz: string;
  parcelWeightOz: string;
  parcelLengthIn: string;
  parcelWidthIn: string;
  parcelHeightIn: string;
};

export const SHIPPING_PRESET_DEFAULTS: Record<
  Exclude<ShippingPreset, "custom">,
  ShippingProfileForm
> = {
  raw_card: {
    shippingCategory: "raw_card",
    shippingBaseWeightOz: "4",
    shippingIncrementalWeightOz: "1",
    parcelWeightOz: "4",
    parcelLengthIn: "6",
    parcelWidthIn: "4",
    parcelHeightIn: "1",
  },
  slab: {
    shippingCategory: "slab",
    shippingBaseWeightOz: "8",
    shippingIncrementalWeightOz: "3",
    parcelWeightOz: "8",
    parcelLengthIn: "8",
    parcelWidthIn: "6",
    parcelHeightIn: "2",
  },
  small_collectible: {
    shippingCategory: "small_collectible",
    shippingBaseWeightOz: "6",
    shippingIncrementalWeightOz: "2",
    parcelWeightOz: "6",
    parcelLengthIn: "8",
    parcelWidthIn: "6",
    parcelHeightIn: "4",
  },
};

export function getPresetFields(preset: ShippingPreset): ShippingProfileForm | null {
  if (preset === "custom") return null;
  return SHIPPING_PRESET_DEFAULTS[preset];
}

export function isCreateActionDisabled(input: {
  hasReadinessIssues: boolean;
  submitting: boolean;
  draftSaving: boolean;
  hasValidationErrors: boolean;
}): boolean {
  if (input.submitting || input.draftSaving) return true;
  if (input.hasReadinessIssues) return true;
  return input.hasValidationErrors;
}

export function getQuickListDefaults(lastUsed: {
  category?: string;
  condition?: string;
  format?: "buy_now" | "auction";
  shippingPreset?: ShippingPreset;
}): ListingQuickDefaults {
  return {
    category: lastUsed.category && lastUsed.category.trim() ? lastUsed.category : "Memorabilia",
    condition: lastUsed.condition && lastUsed.condition.trim() ? lastUsed.condition : "Unspecified",
    shippingPreset: lastUsed.shippingPreset ?? "slab",
    handlingTime: "1–2 business days",
    format: lastUsed.format ?? "buy_now",
  };
}

export function getFieldsHiddenInQuickListMode(enabled: boolean): string[] {
  if (!enabled) return [];
  return ["category", "condition", "description", "shippingAdvanced"];
}

export function getAddAnotherPreservedValues(input: AddAnotherPreservedValues): AddAnotherPreservedValues {
  return {
    category: input.category,
    condition: input.condition,
    format: input.format,
    shippingPreset: input.shippingPreset,
  };
}

export function isAdvancedShippingVisible(input: { quickListMode: boolean; expanded: boolean }): boolean {
  return !input.quickListMode && input.expanded;
}

export function isSaveDraftDisabled(input: { submitting: boolean; draftSaving: boolean }): boolean {
  return input.submitting || input.draftSaving;
}
