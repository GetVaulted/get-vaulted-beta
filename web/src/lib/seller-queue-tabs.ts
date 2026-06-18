/** Seller live shop lineup lanes (auction queue + giveaway lanes). */
export type SellerQueueTab = "auction" | "bin" | "giveaway" | "buyers_giveaway" | "sold";

export type SellerQueueAddModalMode = "auction" | "bin" | "giveaway" | "buyers_giveaway" | null;

export type LiveGiveawayKind = "open" | "buyers";

export function giveawayKindForTab(tab: SellerQueueTab): LiveGiveawayKind | null {
  if (tab === "giveaway") return "open";
  if (tab === "buyers_giveaway") return "buyers";
  return null;
}

export function addModalModeForTab(tab: SellerQueueTab): SellerQueueAddModalMode {
  if (tab === "giveaway") return "giveaway";
  if (tab === "buyers_giveaway") return "buyers_giveaway";
  if (tab === "auction") return "auction";
  if (tab === "bin") return "bin";
  return null;
}

export function isGiveawayTab(tab: SellerQueueTab): boolean {
  return tab === "giveaway" || tab === "buyers_giveaway";
}
