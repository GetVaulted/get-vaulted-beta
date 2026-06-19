import { WALLET_METHOD_CATALOG, type WalletMethodCatalogEntry } from "@/lib/stripe-payment-method-config";

export const LIVE_PREMIUM_WALLET_TITLE = "Vault Wallet";

export type LiveWalletCapabilities = {
  link?: boolean;
  cashAppPay?: boolean;
  amazonPay?: boolean;
  paypal?: boolean;
} | null;

function showOnWeb(entry: WalletMethodCatalogEntry): boolean {
  if (entry.id === "apple_pay" || entry.id === "google_pay") return false;
  return true;
}

/** Instant payment methods accepted on Live (web buyer sheet). */
export function liveAcceptedWalletMethods(capabilities?: LiveWalletCapabilities): WalletMethodCatalogEntry[] {
  return WALLET_METHOD_CATALOG.filter((entry) => {
    if (!entry.eligibility.includes("live")) return false;
    if (!showOnWeb(entry)) return false;
    if (entry.id === "link" && capabilities && !capabilities.link) return false;
    if (entry.id === "cash_app_pay" && capabilities && !capabilities.cashAppPay) return false;
    if (entry.id === "amazon_pay" && capabilities && !capabilities.amazonPay) return false;
    return true;
  });
}

export function liveAcceptedMethodsLabel(capabilities?: LiveWalletCapabilities): string {
  const labels = liveAcceptedWalletMethods(capabilities).map((m) => m.label);
  if (labels.length === 0) return "Card & digital wallets";
  if (labels.length <= 3) return labels.join(" · ");
  return `${labels.slice(0, 2).join(" · ")} +${labels.length - 2} more`;
}

export function formatShipToLine(address: {
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
} | null): string {
  if (!address) return "Add shipping address";
  const street = [address.line1, address.line2].filter(Boolean).join(" ");
  const cityLine = `${address.city} ${address.state} ${address.postalCode}`.trim();
  return `Ship to ${[street, cityLine].filter(Boolean).join(", ")}`;
}

export function formatPaymentSummary(pm: {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
} | null): string {
  if (!pm) return "Add payment method";
  const exp =
    pm.expMonth && pm.expYear
      ? `${String(pm.expMonth).padStart(2, "0")}/${String(pm.expYear).slice(-2)}`
      : "";
  return `${pm.brand} ···· ${pm.last4}${exp ? ` · ${exp}` : ""}`;
}
