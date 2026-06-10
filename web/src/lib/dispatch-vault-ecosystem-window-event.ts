import {
  isLayawayEcosystemEventType,
  isListingEcosystemEventType,
  isOrderEcosystemEventType,
  type VaultEcosystemEvent,
} from "@/lib/vault-ecosystem-realtime";

/** Map Supabase vault_ecosystem payloads to browser window events for page refetch. */
export function dispatchVaultEcosystemWindowEvent(event: VaultEcosystemEvent): void {
  if (typeof window === "undefined") return;

  if (isLayawayEcosystemEventType(event.type)) {
    window.dispatchEvent(new CustomEvent<VaultEcosystemEvent>("gv-layaways-updated", { detail: event }));
  }
  if (isOrderEcosystemEventType(event.type)) {
    window.dispatchEvent(new CustomEvent<VaultEcosystemEvent>("gv-orders-updated", { detail: event }));
  }
  if (isListingEcosystemEventType(event.type)) {
    window.dispatchEvent(new Event("gv-listings-updated"));
  }
  if (event.type === "notification_created") {
    window.dispatchEvent(new Event("gv-notifications-updated"));
  }
  if (event.type === "offer_updated") {
    window.dispatchEvent(new CustomEvent<VaultEcosystemEvent>("gv-offers-updated", { detail: event }));
  }
  if (event.type === "trade_offer_updated") {
    window.dispatchEvent(new CustomEvent<VaultEcosystemEvent>("gv-trades-updated", { detail: event }));
  }
}
