/** Shared Givvy chrome — seller quick pill + buyer side tab use the same tokens. */
export const GIVVY_UI = {
  icon: "#6ee7b7",
  label: "#a7f3d0",
  border: "rgba(110,231,183,0.35)",
  borderStrong: "rgba(110,231,183,0.45)",
  pillBg: "rgba(0,0,0,0.55)",
  count: "#fafafa",
  countMuted: "rgba(250,250,250,0.72)",
} as const;

/**
 * Default official-rules boilerplate prefilled into the "buyers giveaway" rules field so hosts
 * aren't starting from a blank textarea (buyers giveaways require 80+ characters of rules before
 * they can be created). Hosts should still review/edit — the bracketed line needs their own
 * business name — but this clears the create-flow's biggest friction point on its own. Mirrors
 * mobile's GIVVY_DEFAULT_BUYERS_RULES_TEXT.
 */
export const GIVVY_DEFAULT_BUYERS_RULES_TEXT =
  "OFFICIAL RULES — NO PURCHASE NECESSARY TO ENTER OR WIN. Void where prohibited. Open to legal " +
  "residents of the fifty (50) United States and D.C. who are 18 years or older at time of entry. " +
  "Purchases made during the entry window are automatically and separately entered — a purchase " +
  "does not increase your odds of winning. To enter without a purchase, use the alternate method " +
  "of entry (AMOE) link generated with this giveaway. One (1) winner will be selected at random " +
  "from all eligible entries when the host draws the giveaway. Winner will be notified via their " +
  "Get Vaulted account and has 7 days to respond before an alternate winner may be selected. " +
  "Prize is non-transferable; no cash substitution except at Sponsor's sole discretion. Sponsor: " +
  "[Your business/legal name]. By entering, participants agree to these Official Rules.";

export const GIVVY_SIDE_TAB = {
  widthClass: "w-[4.125rem]",
  minHeightClass: "min-h-[5.375rem]",
} as const;
