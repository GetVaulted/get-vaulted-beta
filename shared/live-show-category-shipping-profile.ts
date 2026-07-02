/** Maps live show category (Cards, Helmets, etc.) to seller shipping profile sourceSlug. */

export type LiveShowCategoryProfileOption = {
  id: string;
  sourceSlug: string;
  isDefault?: boolean;
};

/** Seller `sourceSlug` for a Vault event / live room category string. */
export function suggestSellerShippingProfileSourceSlugForCategory(
  category: string | null | undefined,
): string {
  const c = (category ?? "").trim().toLowerCase();
  if (!c) return "live_break_spot";
  if (c === "helmets" || c === "helmet") return "full_size_helmet";
  if (c === "cards") return "live_break_spot";
  if (c.includes("graded") || c.includes("slab")) return "graded_card";
  if (c.includes("mini") && c.includes("helmet")) return "mini_helmet";
  if (c.includes("speedflex")) return "full_size_helmet";
  if (c.includes("helmet")) return "full_size_helmet";
  if (c.includes("jersey") || c.includes("apparel")) return "apparel";
  if (c.includes("sealed") && c.includes("box")) return "sealed_box";
  if (c.includes("funko") || c.includes("collectible")) return "small_collectible";
  if (c.includes("lot") || c.includes("break")) return "live_break_spot";
  if (c.includes("card")) return "live_break_spot";
  return "live_break_spot";
}

export function resolveSellerShippingProfileIdForCategory(
  profiles: readonly LiveShowCategoryProfileOption[],
  category: string | null | undefined,
): string {
  if (profiles.length === 0) return "";
  const slug = suggestSellerShippingProfileSourceSlugForCategory(category);
  const exact = profiles.find((p) => p.sourceSlug === slug);
  if (exact) return exact.id;

  const c = (category ?? "").trim().toLowerCase();
  if (c.includes("helmet")) {
    return (
      profiles.find((p) => p.sourceSlug === "full_size_helmet")?.id ??
      profiles.find((p) => p.sourceSlug === "mini_helmet")?.id ??
      profiles.find((p) => p.isDefault)?.id ??
      profiles[0]?.id ??
      ""
    );
  }

  return (
    profiles.find((p) => p.sourceSlug === "live_break_spot")?.id ??
    profiles.find((p) => p.isDefault)?.id ??
    profiles[0]?.id ??
    ""
  );
}

/** Default profile when adding a queue item — show default wins over category suggestion. */
export function resolveLiveHostDefaultShippingProfileId(args: {
  profiles: readonly LiveShowCategoryProfileOption[];
  roomDefaultSellerShippingProfileId?: string | null;
  roomDefaultShippingProfileId?: string | null;
  category?: string | null;
}): string {
  const { profiles } = args;
  if (profiles.length === 0) return "";
  const roomDefault =
    args.roomDefaultSellerShippingProfileId?.trim() ||
    args.roomDefaultShippingProfileId?.trim() ||
    "";
  if (roomDefault && profiles.some((p) => p.id === roomDefault)) {
    return roomDefault;
  }
  return resolveSellerShippingProfileIdForCategory(profiles, args.category);
}
