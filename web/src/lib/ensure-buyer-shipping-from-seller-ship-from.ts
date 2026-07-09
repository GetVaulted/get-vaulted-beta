import type { PrismaClient } from "@/generated/prisma/client";
import { isShippingAddressCompleteForLabels } from "@/lib/address-book";
import { prisma } from "@/lib/prisma";
import { hasCompleteSellerShipFrom, type SellerShipFromFields } from "@/lib/seller-shipping-readiness";
import { normalizePhoneForShippo } from "@/lib/shippo-label-contacts";

export type EnsureBuyerShippingFromSellerResult = {
  created: boolean;
  updated: boolean;
  addressId: string | null;
};

type ShipFromSource = {
  name: string;
  fullName: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
  email: string | null;
  isVerified: boolean;
};

function shipFromFieldsFromUser(user: {
  email: string | null;
  name: string | null;
  username: string;
  shipFromName: string | null;
  shipFromStreet: string | null;
  shipFromCity: string | null;
  shipFromState: string | null;
  shipFromZip: string | null;
  shipFromCountry: string | null;
  defaultShipFromAddressId: string | null;
  defaultShipFromAddress: {
    name: string;
    fullName: string | null;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    phone: string | null;
    isVerified: boolean;
  } | null;
}): SellerShipFromFields {
  return {
    shipFromStreet: user.shipFromStreet,
    shipFromCity: user.shipFromCity,
    shipFromState: user.shipFromState,
    shipFromZip: user.shipFromZip,
    shipFromCountry: user.shipFromCountry,
    defaultShipFromAddressId: user.defaultShipFromAddressId,
    defaultShipFromAddress: user.defaultShipFromAddress,
    shipFromPhone: user.defaultShipFromAddress?.phone ?? null,
  };
}

function resolveShipFromSource(user: {
  email: string | null;
  name: string | null;
  username: string;
  shipFromName: string | null;
  shipFromStreet: string | null;
  shipFromCity: string | null;
  shipFromState: string | null;
  shipFromZip: string | null;
  shipFromCountry: string | null;
  defaultShipFromAddress: {
    name: string;
    fullName: string | null;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    phone: string | null;
    isVerified: boolean;
  } | null;
}): ShipFromSource | null {
  const src = user.defaultShipFromAddress;
  const line1 = src?.line1?.trim() || user.shipFromStreet?.trim() || "";
  const city = src?.city?.trim() || user.shipFromCity?.trim() || "";
  const state = src?.state?.trim() || user.shipFromState?.trim() || "";
  const postalCode = src?.postalCode?.trim() || user.shipFromZip?.trim() || "";
  const country = src?.country?.trim() || user.shipFromCountry?.trim() || "US";
  const phoneRaw = src?.phone ?? null;
  const phone = normalizePhoneForShippo(phoneRaw);
  if (!line1 || !city || !state || !postalCode || !phone) return null;

  const fullName =
    src?.fullName?.trim() ||
    user.shipFromName?.trim() ||
    user.name?.trim() ||
    user.username ||
    "Shipping";

  return {
    name: src?.name?.trim() || "Home",
    fullName,
    line1,
    line2: src?.line2?.trim() || null,
    city,
    state,
    postalCode,
    country,
    phone,
    email: user.email?.trim() || null,
    isVerified: src?.isVerified ?? true,
  };
}

/**
 * When a seller finished ship-from onboarding but has no buyer ship-to yet, copy ship-from into Wallet.
 * Also heals incomplete shipping rows missing phone when ship-from is complete.
 */
export async function ensureBuyerShippingFromSellerShipFrom(
  userId: string,
  db: Pick<PrismaClient, "user" | "address"> = prisma,
): Promise<EnsureBuyerShippingFromSellerResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      name: true,
      username: true,
      shipFromName: true,
      shipFromStreet: true,
      shipFromCity: true,
      shipFromState: true,
      shipFromZip: true,
      shipFromCountry: true,
      defaultShipFromAddressId: true,
      defaultShipFromAddress: {
        select: {
          name: true,
          fullName: true,
          line1: true,
          line2: true,
          city: true,
          state: true,
          postalCode: true,
          country: true,
          phone: true,
          isVerified: true,
        },
      },
    },
  });
  if (!user || !hasCompleteSellerShipFrom(shipFromFieldsFromUser(user))) {
    return { created: false, updated: false, addressId: null };
  }

  const source = resolveShipFromSource(user);
  if (!source || !isShippingAddressCompleteForLabels(source)) {
    return { created: false, updated: false, addressId: null };
  }

  const existingShipping = await db.address.findFirst({
    where: { userId, type: "shipping" },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });

  if (existingShipping && isShippingAddressCompleteForLabels(existingShipping)) {
    return { created: false, updated: false, addressId: existingShipping.id };
  }

  if (existingShipping) {
    const updated = await db.address.update({
      where: { id: existingShipping.id },
      data: {
        name: source.name,
        fullName: source.fullName,
        line1: source.line1,
        line2: source.line2,
        city: source.city,
        state: source.state,
        postalCode: source.postalCode,
        country: source.country,
        phone: source.phone,
        email: source.email,
        isDefault: true,
        isVerified: source.isVerified,
      },
    });
    return { created: false, updated: true, addressId: updated.id };
  }

  const created = await prisma.$transaction(async (tx) => {
    await tx.address.updateMany({
      where: { userId, type: "shipping", isDefault: true },
      data: { isDefault: false },
    });
    return tx.address.create({
      data: {
        userId,
        type: "shipping",
        ...source,
        isDefault: true,
      },
    });
  });

  return { created: true, updated: false, addressId: created.id };
}
