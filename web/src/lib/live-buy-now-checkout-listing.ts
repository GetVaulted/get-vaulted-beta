import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import { embedListingInventoryChannel } from "@/lib/listing-inventory-channel";
import { PAYMENT_PAID } from "@/services/payments";

/**
 * Buy Now checkout is marketplace-listing-backed. Hosts can still add a fixed-price lot via
 * "New lot" without picking From my shop — this creates (or refreshes) an `active` buy_now
 * listing and links it onto the queue row so buyers can pay.
 *
 * Also mints a fresh listing when the prior linked listing is already sold (multi-unit lots).
 */
export async function ensureLiveBuyNowItemCheckoutListingTx(
  tx: TransactionClient,
  args: { liveRoomId: string; liveRoomItemId: string },
): Promise<{ ok: true; listingId: string } | { ok: false; code: string; error: string }> {
  const item = await tx.liveRoomItem.findFirst({
    where: { id: args.liveRoomItemId, liveRoomId: args.liveRoomId },
    select: {
      id: true,
      title: true,
      imageUrl: true,
      priceUsd: true,
      listingId: true,
      salesFormat: true,
      status: true,
      quantity: true,
      shippingProfileId: true,
      liveRoom: {
        select: {
          sellerId: true,
          category: true,
        },
      },
    },
  });
  if (!item?.liveRoom) {
    return { ok: false, code: "LIVE_ITEM_INVALID", error: "This item is not available to buy." };
  }
  if (item.status !== "queued" && item.status !== "active") {
    return { ok: false, code: "LIVE_ITEM_INVALID", error: "This item is not available to buy." };
  }
  if (item.salesFormat !== "buy_now") {
    return { ok: false, code: "NOT_BUY_NOW", error: "This listing is not buy-now." };
  }

  const priceUsd =
    typeof item.priceUsd === "number" && Number.isFinite(item.priceUsd) && item.priceUsd > 0
      ? item.priceUsd
      : null;
  if (priceUsd == null) {
    return { ok: false, code: "NO_PRICE", error: "This item needs a price before checkout." };
  }

  if (typeof item.quantity === "number" && Number.isFinite(item.quantity) && item.quantity <= 0) {
    return { ok: false, code: "ALREADY_SOLD", error: "This item was already sold." };
  }

  if (item.listingId) {
    const listing = await tx.listing.findUnique({
      where: { id: item.listingId },
      select: {
        id: true,
        status: true,
        buyingFormat: true,
        moderationRemovedAt: true,
      },
    });
    const order = await tx.order.findUnique({
      where: { listingId: item.listingId },
      select: { paymentStatus: true },
    });
    const reusable =
      listing != null &&
      listing.buyingFormat === "buy_now" &&
      listing.status === "active" &&
      !listing.moderationRemovedAt &&
      (!order || order.paymentStatus !== PAYMENT_PAID);
    if (reusable) {
      await tx.listing.update({
        where: { id: listing.id },
        data: { priceUsd },
      });
      return { ok: true, listingId: listing.id };
    }
  }

  const seller = await tx.user.findUnique({
    where: { id: item.liveRoom.sellerId },
    select: { defaultShipFromAddressId: true },
  });

  const title = item.title.trim().slice(0, 200) || "Live item";
  const description = embedListingInventoryChannel(
    `Live show Buy Now — ${title}`.slice(0, 3900),
    "live_show",
  );

  const listing = await tx.listing.create({
    data: {
      sellerId: item.liveRoom.sellerId,
      title,
      description,
      category: (item.liveRoom.category?.trim() || "Live sale").slice(0, 120),
      condition: "See title",
      buyingFormat: "buy_now",
      status: "active",
      priceUsd,
      shippingPriceUsd: 0,
      shippingCategory: "raw_card",
      shipFromAddressId: seller?.defaultShipFromAddressId ?? null,
      platformShippingProfileId: item.shippingProfileId,
    },
    select: { id: true },
  });

  const imageUrl = item.imageUrl?.trim();
  if (imageUrl) {
    await tx.listingImage.create({
      data: {
        listingId: listing.id,
        url: imageUrl.slice(0, 2000),
        sortOrder: 0,
      },
    });
  }

  await tx.liveRoomItem.update({
    where: { id: item.id },
    data: { listingId: listing.id },
  });

  return { ok: true, listingId: listing.id };
}
