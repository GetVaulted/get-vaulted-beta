/**
 * One Shippo label per combined {@link LiveShippingSession} (buyer + show bundle).
 *
 * Physical weight uses each listing’s `parcelWeightOz` when set (actual packed weight for the carrier),
 * otherwise `shippingBaseWeightOz` (live-shipping profile). Never uses `LiveShippingSession.pricingWeightOz`.
 *
 * **Label cost allocation:** total Shippo rate (cents) is split **evenly** across eligible orders; any
 * remainder cents are applied to the first order so the sum matches the carrier quote exactly.
 */
import { createNotification } from "@/lib/notifications";
import { SELLER_COMMERCE_KIND, logSellerCommerceEvent } from "@/lib/seller-commerce-event";
import { prisma } from "@/lib/prisma";
import {
  isShippoConfigured,
  shippoCreateShipment,
  shippoGetTransaction,
  shippoListRates,
  shippoPurchaseRate,
  type ShippoAddress,
  type ShippoParcel,
} from "@/lib/shippo";
import { PAYMENT_PAID } from "@/services/payments";
import { LIVE_BUNDLED_SHIPPING_DESTINATION_KEY } from "@/services/shipping/live-shipping-pricing";
import { buildSessionPackageGroups } from "@/services/shipping/live-shipping-quote";
import {
  filterShippoRatesUspsUps,
  type PackageGroup,
} from "@/lib/unified-shipping-engine";

export type GenerateBundledShippoLabelResult = {
  alreadyExisted: boolean;
  shippoShipmentId: string | null;
  shippoTransactionId: string | null;
  labelUrl: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  carrier: string | null;
  service: string | null;
  shippingLabelCostCents: number;
  orderIds: string[];
};

function parseEnvFloat(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function bundleWeightBufferOz(): number {
  return parseEnvFloat("BUNDLE_WEIGHT_BUFFER_OZ", 1.5);
}

function defaultBundleLengthIn(): number {
  return parseEnvFloat("DEFAULT_BUNDLE_LENGTH_IN", 10);
}

function defaultBundleWidthIn(): number {
  return parseEnvFloat("DEFAULT_BUNDLE_WIDTH_IN", 8);
}

function defaultBundleHeightIn(): number {
  return parseEnvFloat("DEFAULT_BUNDLE_HEIGHT_IN", 4);
}

/** Combined live bundle (not per-order ship-alone bucket). */
export function isCombinedLiveBundleSession(destinationAddressId: string | null): boolean {
  if (destinationAddressId == null) return true;
  if (destinationAddressId === LIVE_BUNDLED_SHIPPING_DESTINATION_KEY) return true;
  return !destinationAddressId.startsWith("ship-alone:");
}

function orderHasLabel(o: { shippoTransactionId: string | null; labelUrl: string | null }): boolean {
  return Boolean(o.shippoTransactionId?.trim() || o.labelUrl?.trim());
}

type ListingShipProfile = {
  id: string;
  title: string;
  shipAlone: boolean;
  parcelWeightOz: number | null;
  shippingBaseWeightOz: number;
  parcelLengthIn: number | null;
  parcelWidthIn: number | null;
  parcelHeightIn: number | null;
};

/** Per-listing physical weight for carrier (oz), not session pricing weight. */
export function physicalListingWeightOz(listing: ListingShipProfile): number {
  if (listing.parcelWeightOz != null && Number.isFinite(listing.parcelWeightOz) && listing.parcelWeightOz > 0) {
    return Math.max(1, listing.parcelWeightOz);
  }
  const base = listing.shippingBaseWeightOz;
  if (Number.isFinite(base) && base > 0) return Math.max(1, base);
  return 1;
}

function maxBundleDimensionsInches(listings: ListingShipProfile[]): { length: number; width: number; height: number } {
  let maxL = 0;
  let maxW = 0;
  let maxH = 0;
  for (const li of listings) {
    const l = li.parcelLengthIn;
    const w = li.parcelWidthIn;
    const h = li.parcelHeightIn;
    if (l != null && w != null && h != null && [l, w, h].every((n) => Number.isFinite(n) && n > 0)) {
      maxL = Math.max(maxL, l);
      maxW = Math.max(maxW, w);
      maxH = Math.max(maxH, h);
    }
  }
  if (maxL > 0 && maxW > 0 && maxH > 0) {
    return { length: maxL, width: maxW, height: maxH };
  }
  return {
    length: defaultBundleLengthIn(),
    width: defaultBundleWidthIn(),
    height: defaultBundleHeightIn(),
  };
}

function buildParcelFromPackageGroup(group: PackageGroup, totalWeightOz?: number): ShippoParcel {
  const w = Math.max(1, Math.ceil((totalWeightOz ?? group.weightOz + bundleWeightBufferOz()) * 10) / 10);
  return {
    length: String(group.lengthIn),
    width: String(group.widthIn),
    height: String(group.heightIn),
    distance_unit: "in",
    weight: String(w),
    mass_unit: "oz",
  };
}

type SessionOrder = {
  id: string;
  buyerId: string;
  sellerId: string;
  paymentStatus: string;
  shippoTransactionId: string | null;
  labelUrl: string | null;
  shipRecipientName: string;
  shipAddress: string;
  shipCity: string;
  shipState: string;
  shipZip: string;
  shipCountry: string;
  listing: ListingShipProfile;
};

function filterEligibleBundledOrders(orders: SessionOrder[]): SessionOrder[] {
  return orders.filter(
    (o) =>
      o.paymentStatus === PAYMENT_PAID &&
      !orderHasLabel(o) &&
      !o.listing.shipAlone,
  );
}

function addressesMatch(a: SessionOrder, b: SessionOrder): boolean {
  return (
    a.shipZip.trim() === b.shipZip.trim() &&
    a.shipCountry.trim().toUpperCase() === b.shipCountry.trim().toUpperCase() &&
    a.shipAddress.trim() === b.shipAddress.trim() &&
    a.shipCity.trim().toLowerCase() === b.shipCity.trim().toLowerCase() &&
    a.shipState.trim().toLowerCase() === b.shipState.trim().toLowerCase()
  );
}

/**
 * Purchase one Shippo label for all eligible paid, non-ship-alone orders in a combined live session.
 * If any order in the session already has a label, returns that label metadata without calling Shippo again.
 */
export async function generateBundledShippoLabelForSession(
  sessionId: string,
  sellerId: string,
): Promise<GenerateBundledShippoLabelResult> {
  if (!isShippoConfigured()) {
    throw new Error("SHIPPO_NOT_CONFIGURED");
  }

  const session = await prisma.liveShippingSession.findFirst({
    where: { id: sessionId, sellerId },
    include: {
      seller: {
        select: {
          shipFromStreet: true,
          shipFromCity: true,
          shipFromState: true,
          shipFromZip: true,
          shipFromCountry: true,
          shipFromName: true,
        },
      },
      orders: {
        orderBy: { createdAt: "asc" },
        include: {
          listing: {
            select: {
              id: true,
              title: true,
              shipAlone: true,
              parcelWeightOz: true,
              shippingBaseWeightOz: true,
              parcelLengthIn: true,
              parcelWidthIn: true,
              parcelHeightIn: true,
            },
          },
        },
      },
    },
  });

  if (!session) {
    throw new Error("SESSION_NOT_FOUND");
  }

  if (!isCombinedLiveBundleSession(session.destinationAddressId)) {
    throw new Error("NOT_A_COMBINED_BUNDLE_SESSION");
  }

  const labeled = session.orders.find((o) => orderHasLabel(o));
  if (labeled) {
    return {
      alreadyExisted: true,
      shippoShipmentId: labeled.shippoShipmentId ?? null,
      shippoTransactionId: labeled.shippoTransactionId ?? null,
      labelUrl: labeled.labelUrl ?? null,
      trackingNumber: labeled.trackingNumber ?? null,
      trackingUrl: labeled.trackingUrl ?? null,
      carrier: labeled.carrier ?? null,
      service: labeled.service ?? null,
      shippingLabelCostCents: session.orders.reduce((s, o) => {
        const c = o.shippingLabelCostCents;
        return s + (c != null && Number.isFinite(c) ? Math.max(0, Math.floor(c)) : 0);
      }, 0),
      orderIds: session.orders.filter((o) => orderHasLabel(o)).map((o) => o.id),
    };
  }

  const eligible = filterEligibleBundledOrders(session.orders as SessionOrder[]);
  if (eligible.length === 0) {
    throw new Error("NO_ELIGIBLE_ORDERS");
  }

  const first = eligible[0]!;
  for (const o of eligible.slice(1)) {
    if (!addressesMatch(first, o)) {
      throw new Error("MISMATCHED_SHIP_TO_ADDRESSES");
    }
  }

  const from = session.seller;
  if (!from.shipFromStreet || !from.shipFromCity || !from.shipFromState || !from.shipFromZip || !from.shipFromCountry) {
    throw new Error("SELLER_SHIP_FROM_INCOMPLETE");
  }

  const addressFrom: ShippoAddress = {
    name: from.shipFromName || "Seller",
    street1: from.shipFromStreet,
    city: from.shipFromCity,
    state: from.shipFromState,
    zip: from.shipFromZip,
    country: from.shipFromCountry,
  };
  const addressTo: ShippoAddress = {
    name: first.shipRecipientName,
    street1: first.shipAddress,
    city: first.shipCity,
    state: first.shipState,
    zip: first.shipZip,
    country: first.shipCountry,
  };

  const listings = eligible.map((o) => o.listing);
  const built = await buildSessionPackageGroups(sessionId);
  const packageGroups =
    built && built.groups.length > 0
      ? built.groups
      : [
          {
            packageIndex: 0,
            items: eligible.map((o) => ({
              itemId: o.id,
              profile: {
                id: "legacy",
                slug: "legacy",
                name: "Legacy",
                weightOz: physicalListingWeightOz(o.listing),
                lengthIn: 10,
                widthIn: 8,
                heightIn: 4,
                bundleAllowed: true,
                requiresSeparatePackage: false,
                bundleGroup: "legacy",
                maxUnitsPerParcel: null,
              },
            })),
            weightOz: listings.reduce((sum, li) => sum + physicalListingWeightOz(li), 0) + bundleWeightBufferOz(),
            lengthIn: maxBundleDimensionsInches(listings).length,
            widthIn: maxBundleDimensionsInches(listings).width,
            heightIn: maxBundleDimensionsInches(listings).height,
          },
        ];

  let shippingLabelCostCentsTotal = 0;
  const primaryTxIds: string[] = [];
  const primaryLabelUrls: string[] = [];
  let primaryTracking: string | null = null;
  let primaryTrackingUrl: string | null = null;
  let primaryCarrier: string | null = null;
  let primaryService: string | null = null;
  let primaryShipmentId: string | null = null;

  try {
    for (const group of packageGroups) {
      const parcel = buildParcelFromPackageGroup(group);
      const shipment = (await shippoCreateShipment({
        address_from: addressFrom,
        address_to: addressTo,
        parcels: [parcel],
        async: false,
      })) as { object_id?: string };

      const sid = shipment.object_id;
      if (!sid) throw new Error("Shippo shipment missing object_id");

      const ratesRes = (await shippoListRates(sid)) as {
        results?: { object_id?: string; amount?: string; provider?: string; servicelevel?: { name?: string } }[];
      };
      const rates = filterShippoRatesUspsUps(ratesRes.results ?? []);
      const cheapest = rates[0];
      if (!cheapest?.object_id) throw new Error("No Shippo rates");

      const packageCostCents = Math.round(Number(cheapest.amount ?? 0) * 100);
      shippingLabelCostCentsTotal += packageCostCents;

      const tx = (await shippoPurchaseRate(cheapest.object_id)) as {
        object_id?: string;
        tracking_number?: string;
        tracking_url_provider?: string;
        label_url?: string;
        status?: string;
      };

      const transactionId = tx.object_id ?? cheapest.object_id;
      let labelUrlForPackage = tx.label_url?.trim() || null;
      if (!labelUrlForPackage && transactionId) {
        try {
          const fetched = await shippoGetTransaction(transactionId);
          labelUrlForPackage = fetched.label_url?.trim() || null;
        } catch (fetchErr) {
          console.warn("[shippo] bundled post-purchase label fetch failed", {
            sessionId,
            transactionId,
            error: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
          });
        }
      }

      if (group.packageIndex === 0) {
        primaryShipmentId = sid;
        primaryTxIds.push(transactionId ?? "");
        primaryLabelUrls.push(labelUrlForPackage ?? "");
        primaryTracking = tx.tracking_number ?? null;
        primaryTrackingUrl = tx.tracking_url_provider ?? null;
        primaryCarrier = cheapest.provider ?? null;
        primaryService = cheapest.servicelevel?.name ?? null;
      }

      await prisma.shipmentPackage.create({
        data: {
          liveShippingSessionId: sessionId,
          packageIndex: group.packageIndex,
          weightOz: group.weightOz,
          lengthIn: group.lengthIn,
          widthIn: group.widthIn,
          heightIn: group.heightIn,
          shippoShipmentId: sid,
          shippoRateId: cheapest.object_id,
          shippoTransactionId: transactionId ?? null,
          carrier: cheapest.provider ?? null,
          serviceLevel: cheapest.servicelevel?.name ?? null,
          trackingNumber: tx.tracking_number ?? null,
          labelUrl: labelUrlForPackage,
          labelCostCents: packageCostCents,
          status: "label_created",
        },
      });
    }

    const n = eligible.length;
    const baseEach = Math.floor(shippingLabelCostCentsTotal / n);
    const remainder = shippingLabelCostCentsTotal - baseEach * n;

    const transactionId = primaryTxIds[0] ?? null;
    const labelUrl = primaryLabelUrls[0]?.trim() || null;
    const trackingNumber = primaryTracking;
    const trackingUrl = primaryTrackingUrl;
    const carrier = primaryCarrier;
    const service = primaryService;
    const shippingStatus = labelUrl ? "SUCCESS" : "label_pending";

    await prisma.$transaction(
      eligible.map((o, idx) =>
        prisma.order.update({
          where: { id: o.id },
          data: {
            shippoShipmentId: primaryShipmentId,
            shippoTransactionId: transactionId,
            carrier,
            service,
            trackingNumber,
            trackingUrl,
            labelUrl,
            shippingStatus,
            fulfillmentStatus: labelUrl ? "label_created" : "exception",
            shippingLabelCostCents: baseEach + (idx === 0 ? remainder : 0),
          },
        }),
      ),
    );

    const tn = trackingNumber ? ` Tracking: ${trackingNumber}.` : "";
    for (const o of eligible) {
      const lt = o.listing.title.length > 80 ? `${o.listing.title.slice(0, 77)}…` : o.listing.title;
      await logSellerCommerceEvent({
        sellerId: session.sellerId,
        listingId: o.listing.id,
        orderId: o.id,
        kind: SELLER_COMMERCE_KIND.fulfillmentLabelCreated,
        title: "Bundled shipping label created",
        body: `Live bundle label (same package) for “${lt}”.${tn}`,
      });
      await createNotification(prisma, {
        userId: o.buyerId,
        type: "order_label_created",
        title: "Shipping label created",
        body: `Your order for “${lt}” is included on a bundled carrier label.${tn}`,
        href: `/orders/${encodeURIComponent(o.id)}`,
      });
    }
    await createNotification(prisma, {
      userId: session.sellerId,
      type: "seller_label_created",
      title: "Bundled label ready",
      body: `A bundled live-shipping label was purchased for ${eligible.length} order(s).${tn}`,
      href: `/account/sales`,
    });

    return {
      alreadyExisted: false,
      shippoShipmentId: primaryShipmentId,
      shippoTransactionId: transactionId ?? null,
      labelUrl: labelUrl ?? null,
      trackingNumber,
      trackingUrl,
      carrier,
      service,
      shippingLabelCostCents: shippingLabelCostCentsTotal,
      orderIds: eligible.map((o) => o.id),
    };
  } catch (e) {
    console.error(`[shippo] bundled label failed session ${sessionId}`, e);
    await prisma.$transaction(
      eligible.map((o) =>
        prisma.order.update({
          where: { id: o.id },
          data: {
            fulfillmentStatus: "exception",
            shippingStatus: "label_error",
          },
        }),
      ),
    );
    const errMsg = e instanceof Error ? e.message : String(e);
    for (const o of eligible) {
      const lt = o.listing.title.length > 80 ? `${o.listing.title.slice(0, 77)}…` : o.listing.title;
      await logSellerCommerceEvent({
        sellerId: session.sellerId,
        listingId: o.listing.id,
        orderId: o.id,
        kind: SELLER_COMMERCE_KIND.fulfillmentException,
        title: "Bundled shipping exception",
        body: `Shippo could not create the live bundle label for “${lt}”. ${errMsg.slice(0, 200)}`,
      });
    }
    throw e;
  }
}
