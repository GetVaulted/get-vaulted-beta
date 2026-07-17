import type { BuyerLiveShippingSessionApi } from "@/services/shipping/buyer-live-shipping-ux";
import { getBuyerBundledLiveShippingSessionUx } from "@/services/shipping/buyer-live-shipping-ux";
import { resolveBuyerDefaultShippingForOrder } from "@/lib/live-buy-now-purchase";
import { buyerLiveShowShippingHudCopy, shippingModeFromRoomFlags } from "@/lib/live-show-shipping-terms";
import {
  estimateSalesTaxCents,
  isStripeTaxFeatureEnabled,
  loadSellerShipFromForTax,
  normalizeShipToAddress,
} from "@/lib/stripe-tax";
import { prisma } from "@/lib/prisma";

export type LiveVariantCheckoutPreview = {
  itemPriceUsd: number;
  /** Bundled live shipping total after this spot purchase (USD). */
  shippingUsd: number;
  shippingDisplay: string;
  taxUsd: number;
  taxDisplay: string;
  /** True when the buyer's ship-to jurisdiction actually collects sales tax on this order. */
  taxApplies: boolean;
  /** Item + shipping + tax charged to the saved card at purchase. */
  chargeNowUsd: number;
  /** Same as chargeNowUsd — full amount due at checkout. */
  estimatedTotalUsd: number;
  taxNote: string | null;
};

export function bundledLiveShippingTotalCentsAfterWin(session: BuyerLiveShippingSessionApi): number {
  if (session.freeShippingEnabled || session.shippingMode === "free") return 0;
  const delta = session.previewWinDeltaCents ?? 0;
  const paid = session.shippingCostCents;
  if (paid <= 0 && session.packageCount <= 0) return Math.max(0, delta);
  if (session.capReached) return paid;
  return paid + Math.max(0, delta);
}

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

/** Checkout sheet: dollar amount due now, or free after the show shipping cap is met. */
export function variantCheckoutShippingDisplay(args: {
  shippingUsd: number;
  freeShippingEnabled?: boolean;
  shippingMode?: "calculated" | "capped" | "free";
}): string {
  if (args.freeShippingEnabled || args.shippingMode === "free") return "Free shipping";
  if (args.shippingUsd <= 0) return "Free shipping";
  return fmtUsd(args.shippingUsd);
}

export async function getLiveVariantCheckoutPreview(args: {
  buyerId: string;
  liveRoomId: string;
  liveRoomItemId: string;
  itemPriceUsd: number;
}): Promise<LiveVariantCheckoutPreview | null> {
  const itemPriceUsd = Math.round(Math.max(0, args.itemPriceUsd) * 100) / 100;
  if (itemPriceUsd <= 0) return null;

  const room = await prisma.liveRoom.findUnique({
    where: { id: args.liveRoomId },
    select: {
      id: true,
      sellerId: true,
      roomType: true,
      shippingCapEnabled: true,
      shippingCapCents: true,
      freeShippingEnabled: true,
      sellerPaysOverCap: true,
      shippingMode: true,
    },
  });
  if (!room || !["auction", "break", "sale"].includes(room.roomType)) return null;

  const item = await prisma.liveRoomItem.findFirst({
    where: { id: args.liveRoomItemId, liveRoomId: args.liveRoomId },
    select: { id: true },
  });
  if (!item) return null;

  const shippingMode = shippingModeFromRoomFlags(room);
  const capCents = shippingMode === "capped" ? room.shippingCapCents : null;
  const fallbackShippingSession = (): BuyerLiveShippingSessionApi => ({
    shippingCostCents: 0,
    pricingWeightOz: 0,
    capReached: false,
    nextIncrementalCostCents: null,
    tierLabel: null,
    shippingCapCents: capCents,
    freeShippingEnabled: room.freeShippingEnabled,
    shippingMode,
    showShippingHudCopy: buyerLiveShowShippingHudCopy({ mode: shippingMode, capCents: room.shippingCapCents }),
    packageCount: 0,
    previewWinDeltaCents: null,
    previewRequiresSeparatePackage: false,
  });

  let shippingSession: BuyerLiveShippingSessionApi;
  try {
    const session = await getBuyerBundledLiveShippingSessionUx(args.buyerId, args.liveRoomId, {
      previewLiveRoomItemId: args.liveRoomItemId,
    });
    shippingSession = session ?? fallbackShippingSession();
  } catch (e) {
    console.error("[checkout-preview] bundled shipping session failed", {
      liveRoomId: args.liveRoomId,
      liveRoomItemId: args.liveRoomItemId,
      e,
    });
    shippingSession = fallbackShippingSession();
  }

  const incrementalShippingCents = shippingSession.capReached
    ? 0
    : Math.max(0, shippingSession.previewWinDeltaCents ?? 0);
  const shippingUsd = Math.round(incrementalShippingCents) / 100;

  const shippingDisplay = variantCheckoutShippingDisplay({
    shippingUsd,
    freeShippingEnabled: shippingSession.freeShippingEnabled,
    shippingMode: shippingSession.shippingMode,
  });

  let taxUsd = 0;
  let taxDisplay = "Not applicable";
  let taxApplies = false;
  let taxNote: string | null = null;

  const buyerShipping = await resolveBuyerDefaultShippingForOrder(args.buyerId);
  if (!buyerShipping) {
    taxDisplay = "Add address to estimate";
    taxNote = "Save a shipping address in Vault Wallet to estimate sales tax.";
  } else if (!isStripeTaxFeatureEnabled()) {
    taxDisplay = "Not applicable";
  } else {
    const sellerShipFrom = await loadSellerShipFromForTax(room.sellerId);
    const shipTo = normalizeShipToAddress({
      shipRecipientName: buyerShipping.shipRecipientName,
      shipAddress: buyerShipping.shipAddress,
      shipCity: buyerShipping.shipCity,
      shipState: buyerShipping.shipState,
      shipZip: buyerShipping.shipZip,
      shipCountry: buyerShipping.shipCountry,
    });
    try {
      const est = await estimateSalesTaxCents({
        itemPriceUsd,
        shippingPriceUsd: shippingUsd,
        shipTo,
        sellerShipFrom,
      });
      taxUsd = est.taxAmountCents / 100;
      taxApplies = est.collectTax;
      if (est.collectTax && est.taxAmountCents > 0) {
        taxDisplay = fmtUsd(taxUsd);
      } else if (est.collectTax) {
        taxDisplay = fmtUsd(0);
      } else {
        taxDisplay = "Not applicable";
      }
    } catch {
      taxDisplay = "Calculated at checkout";
      taxNote = "Sales tax is calculated securely when required.";
    }
  }

  const chargeNowUsd = Math.round((itemPriceUsd + shippingUsd + taxUsd) * 100) / 100;

  return {
    itemPriceUsd,
    shippingUsd,
    shippingDisplay,
    taxUsd,
    taxDisplay,
    taxApplies,
    chargeNowUsd,
    estimatedTotalUsd: chargeNowUsd,
    taxNote,
  };
}
