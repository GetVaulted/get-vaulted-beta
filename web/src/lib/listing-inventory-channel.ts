export type ListingInventoryChannel = "marketplace" | "live_show";

export const LIVE_SHOW_INVENTORY_MARKER = "<!--gv-inventory:live_show-->";
export const MARKETPLACE_INVENTORY_MARKER = "<!--gv-inventory:marketplace-->";

const MARKER_RE = /<!--gv-inventory:(marketplace|live_show)-->/;
const MARKER_STRIP_RE = /\n?<!--gv-inventory:(marketplace|live_show)-->/g;

export function parseListingInventoryChannel(description: string): ListingInventoryChannel | null {
  const m = description.match(MARKER_RE);
  if (m?.[1] === "marketplace" || m?.[1] === "live_show") return m[1];
  return null;
}

/** Buyer-facing description — strips the internal inventory-channel HTML comment. */
export function stripListingInventoryChannelMarker(description: string): string {
  return description.replace(MARKER_STRIP_RE, "").trimEnd();
}

export function embedListingInventoryChannel(
  description: string,
  channel: ListingInventoryChannel,
): string {
  const stripped = description.replace(/\n<!--gv-inventory:(marketplace|live_show)-->/g, "").trimEnd();
  return `${stripped}\n<!--gv-inventory:${channel}-->`;
}

export function parseInventoryChannelFromBody(body: unknown): ListingInventoryChannel | null {
  if (typeof body !== "object" || body === null) return null;
  const v = (body as { inventoryChannel?: unknown }).inventoryChannel;
  if (v === "marketplace" || v === "live_show") return v;
  return null;
}
