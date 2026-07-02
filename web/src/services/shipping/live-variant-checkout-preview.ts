import type { BuyerLiveShippingSessionApi } from "@/services/shipping/buyer-live-shipping-ux";
import { getBuyerBundledLiveShippingSessionUx } from "@/services/shipping/buyer-live-shipping-ux";
import { resolveBuyerDefaultShippingForOrder } from "@/lib/live-buy-now-purchase";
import { buyerLiveShippingPaidCopy, buyerLiveShippingPreviewCopy } from "@/lib/live-show-shipping-terms";
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
    select: { id: true, sellerId: true, roomType: true },
  });
  if (!room || !["auction", "break", "sale"].includes(room.roomType)) return null;

  const item = await prisma.liveRoomItem.findFirst({
    where: { id: args.liveRoomItemId, liveRoomId: args.liveRoomId },
    select: { id: true },
  });
  if (!item) return null;

  const shippingSession = await getBuyerBundledLiveShippingSessionUx(args.buyerId, args.liveRoomId, {
    previewLiveRoomItemId: args.liveRoomItemId,
  });
  if (!shippingSession) return null;

  const bundledShippingCents = bundledLiveShippingTotalCentsAfterWin(shippingSession);
  const incrementalShippingCents = shippingSession.capReached
    ? 0
    : Math.max(0, shippingSession.previewWinDeltaCents ?? 0);
  const shippingUsd = Math.round(incrementalShippingCents) / 100;

  let shippingDisplay: string;
  if (shippingSession.freeShippingEnabled || shippingSession.shippingMode === "free") {
    shippingDisplay = "Free shipping";
  } else if (shippingSession.capReached && incrementalShippingCents <= 0) {
    shippingDisplay = buyerLiveShippingPaidCopy({
      mode: shippingSession.shippingMode,
      paidCents: shippingSession.shippingCostCents,
      capCents: shippingSession.shippingCapCents,
      capReached: true,
    });
  } else if (bundledShippingCents > 0) {
    shippingDisplay =
      shippingSession.shippingMode === "capped"
        ? buyerLiveShippingPreviewCopy({
            mode: shippingSession.shippingMode,
            previewFromCents: bundledShippingCents,
            capCents: shippingSession.shippingCapCents,
          })
        : fmtUsd(bundledShippingCents / 100);
  } else {
    shippingDisplay = buyerLiveShippingPreviewCopy({
      mode: shippingSession.shippingMode,
      previewFromCents: null,
      capCents: shippingSession.shippingCapCents,
    });
  }

  let taxUsd = 0;
  let taxDisplay = "Not applicable";
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
    chargeNowUsd,
    estimatedTotalUsd: chargeNowUsd,
    taxNote,
  };
}
