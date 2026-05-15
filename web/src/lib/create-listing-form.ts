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
