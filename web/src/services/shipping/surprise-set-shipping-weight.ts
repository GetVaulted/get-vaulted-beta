import { prisma } from "@/lib/prisma";
import { surpriseSetWeightOzForLabel } from "../../../../shared/surprise-set";
import { refreshLiveShippingSessionShippoEstimate } from "@/services/shipping/live-shipping-quote";

/**
 * A Surprise Set unit is drawn AFTER the buyer pays, so the shipping session first records the show's
 * normal spot weight for it. Once the draw lands on an item with a declared weight (helmet = 60 oz),
 * swap that weight in. The session's package builder then adds the buyer's wins up and starts another
 * label whenever the seller's per-label ounce limit is reached.
 *
 * Never throws: the sale is already complete, so a failure here only leaves the default weight in place.
 */
export async function applySurpriseSetRevealWeightToShipping(args: {
  fulfillmentOrderId: string | null | undefined;
  liveRoomItemId: string;
  revealedLabel: string;
}): Promise<{ applied: boolean; weightOz: number | null }> {
  try {
    const orderId = args.fulfillmentOrderId?.trim();
    if (!orderId) return { applied: false, weightOz: null };

    const lot = await prisma.liveRoomItem.findUnique({
      where: { id: args.liveRoomItemId },
      select: { surpriseSetItems: true },
    });
    const weightOz = surpriseSetWeightOzForLabel(lot?.surpriseSetItems, args.revealedLabel);
    if (weightOz == null) return { applied: false, weightOz: null };

    const updated = await prisma.liveShippingSessionItem.updateMany({
      where: { orderId },
      data: { appliedWeightOz: weightOz },
    });
    if (updated.count === 0) return { applied: false, weightOz };

    const row = await prisma.liveShippingSessionItem.findUnique({
      where: { orderId },
      select: { sessionId: true },
    });
    if (row) {
      try {
        await refreshLiveShippingSessionShippoEstimate(row.sessionId);
      } catch (e) {
        console.warn("[surprise-set shipping] estimate refresh failed; weight still saved", e);
      }
    }
    return { applied: true, weightOz };
  } catch (e) {
    console.error("[surprise-set shipping] could not apply revealed item weight", e);
    return { applied: false, weightOz: null };
  }
}
