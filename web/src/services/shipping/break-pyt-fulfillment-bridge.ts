/**
 * Break/PYT commerce bridge — paid spots and variant purchases do not yet create
 * platform Orders or Shippo labels. These hooks mark external-fulfillment intent
 * for host console messaging and future post-break Order conversion.
 */

export async function markBreakSpotExternalFulfillmentRequired(_breakSpotId: string): Promise<void> {
  // No-op until break spots are linked to platform Orders after the show.
}

export async function markVariantPurchaseExternalFulfillmentRequired(
  _purchaseId: string,
): Promise<void> {
  // No-op until variant PYT purchases are linked to platform Orders after the show.
}
