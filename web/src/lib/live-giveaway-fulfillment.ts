import type { LiveGiveaway, User } from "@/generated/prisma/client";
import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import { resolveBuyerDefaultShippingForOrder } from "@/lib/live-buy-now-purchase";
import { createNotification } from "@/lib/notifications";
import { addOrderToLiveShippingSessionTx } from "@/services/shipping/live-shipping-pricing";
import { resolveDefaultProfileForLiveShow } from "@/services/shipping/platform-shipping-profiles";
import { resolveShippingProfileDimensions } from "@/lib/unified-shipping-engine";
import { PAYMENT_PAID } from "@/services/payments";

type GiveawayForFulfillment = Pick<
  LiveGiveaway,
  "id" | "liveRoomId" | "title" | "prizeDescription" | "imageUrl" | "fulfillmentOrderId"
> & {
  winnerUserId: string;
  winnerUser?: Pick<User, "username"> | null;
};

/** Creates a paid $0 marketplace order + live shipping session row for a drawn giveaway winner. */
export async function createOrderFromGiveawayWinTx(
  tx: TransactionClient,
  args: { giveaway: GiveawayForFulfillment; sellerId: string },
): Promise<string> {
  if (args.giveaway.fulfillmentOrderId) {
    return args.giveaway.fulfillmentOrderId;
  }

  const winnerId = args.giveaway.winnerUserId?.trim();
  if (!winnerId) throw new Error("GIVEAWAY_NO_WINNER");

  const shipping = await resolveBuyerDefaultShippingForOrder(winnerId);
  const prizeTitle = args.giveaway.title.trim().slice(0, 200) || "Giveaway prize";
  const listingTitle = `Giveaway: ${prizeTitle}`.slice(0, 200);

  const show = await tx.liveRoom.findFirst({
    where: { id: args.giveaway.liveRoomId, sellerId: args.sellerId },
    select: {
      id: true,
      defaultShippingProfileId: true,
      category: true,
    },
  });
  if (!show) throw new Error("GIVEAWAY_ROOM_NOT_FOUND");

  const seller = await tx.user.findUnique({
    where: { id: args.sellerId },
    select: { defaultShipFromAddressId: true },
  });

  let parcelWeightOz = 8;
  let parcelLengthIn = 6;
  let parcelWidthIn = 4;
  let parcelHeightIn = 2;
  const profile = await resolveDefaultProfileForLiveShow({
    showDefaultProfileId: show.defaultShippingProfileId,
    category: show.category,
    db: tx,
  });
  if (profile) {
    const dims = resolveShippingProfileDimensions(profile, null);
    parcelWeightOz = dims.weightOz;
    parcelLengthIn = dims.lengthIn;
    parcelWidthIn = dims.widthIn;
    parcelHeightIn = dims.heightIn;
  }

  const listing = await tx.listing.create({
    data: {
      sellerId: args.sellerId,
      title: listingTitle,
      description: (args.giveaway.prizeDescription || prizeTitle).slice(0, 4000),
      category: "Giveaway",
      condition: "See title",
      buyingFormat: "buy_now",
      status: "sold",
      priceUsd: 0,
      shippingPriceUsd: 0,
      shippingCategory: "small_collectible",
      parcelWeightOz,
      parcelLengthIn,
      parcelWidthIn,
      parcelHeightIn,
      shipFromAddressId: seller?.defaultShipFromAddressId ?? null,
    },
    select: { id: true },
  });

  const imageUrl = args.giveaway.imageUrl?.trim();
  if (imageUrl) {
    await tx.listingImage.create({
      data: {
        listingId: listing.id,
        url: imageUrl.slice(0, 2000),
        sortOrder: 0,
      },
    });
  }

  const shipRecipientName = shipping?.shipRecipientName ?? "Giveaway winner";
  const shipAddress = shipping?.shipAddress ?? "Coordinate shipping with the seller";
  const shipCity = shipping?.shipCity ?? "—";
  const shipState = shipping?.shipState ?? "—";
  const shipZip = shipping?.shipZip ?? "00000";
  const shipCountry = shipping?.shipCountry ?? "US";

  const order = await tx.order.create({
    data: {
      listingId: listing.id,
      buyerId: winnerId,
      sellerId: args.sellerId,
      itemPriceUsd: 0,
      shippingPriceUsd: 0,
      taxUsd: 0,
      totalUsd: 0,
      status: "paid",
      paymentStatus: PAYMENT_PAID,
      fulfillmentStatus: "pending",
      paymentLabel: "giveaway",
      shipRecipientName,
      shipAddress,
      shipCity,
      shipState,
      shipZip,
      shipCountry,
      buyerAddressId: shipping?.buyerAddressId ?? null,
      sellerShipFromAddressId: seller?.defaultShipFromAddressId ?? null,
    },
    select: { id: true },
  });

  await addOrderToLiveShippingSessionTx(tx, order.id, { liveShowId: args.giveaway.liveRoomId });

  await tx.liveGiveaway.update({
    where: { id: args.giveaway.id },
    data: { fulfillmentOrderId: order.id },
  });

  const titleShort = prizeTitle.length > 80 ? `${prizeTitle.slice(0, 77)}…` : prizeTitle;
  await createNotification(tx, {
    userId: winnerId,
    type: "giveaway_won",
    title: "You won the giveaway!",
    body: shipping
      ? `You won “${titleShort}”. We'll ship it after the show — track it in your orders.`
      : `You won “${titleShort}”. Add a shipping address in Wallet so the host can ship your prize.`,
    href: `/orders/${encodeURIComponent(order.id)}`,
  });
  await createNotification(tx, {
    userId: args.sellerId,
    type: "seller_ready_to_ship",
    title: "Giveaway winner — ship prize",
    body: `@${args.giveaway.winnerUser?.username?.trim() || "winner"} won “${titleShort}”. Create a label from Sales.`,
    href: "/account/sales",
  });

  return order.id;
}
