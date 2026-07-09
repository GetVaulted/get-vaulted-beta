import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { resolveAccountSellerUserId } from "@/lib/resolve-account-seller-user";
import { loadAccountSellerPayload } from "@/lib/load-account-seller-payload";
import { serializePrismaClientError } from "@/lib/prisma-client-error-serialize";
import { isQaSessionDebugAllowed } from "@/lib/qa-session-debug-allowed";
import { prisma } from "@/lib/prisma";
import { SELLER_SHIP_FROM_COUNTRY } from "@/lib/seller-shipping-readiness";
import { ensureBuyerShippingFromSellerShipFrom } from "@/lib/ensure-buyer-shipping-from-seller-ship-from";
import { normalizeUsStateCode } from "@/lib/us-state-code";
import { verifyAddressForShipping } from "@/lib/shippo-address-validation";
import { normalizePhoneForShippo } from "@/lib/shippo-label-contacts";
import { getSellerLiveReadiness } from "@/services/seller/live-show-readiness";
import { processAuctionPaymentExpiries } from "@/services/payments";

export async function GET(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  try {
    await processAuctionPaymentExpiries();
  } catch (e) {
    console.error("[api/account/seller] processAuctionPaymentExpiries", e);
  }

  const resolved = await resolveAccountSellerUserId(req);
  if (resolved instanceof NextResponse) return resolved;

  try {
    const payload = await loadAccountSellerPayload(resolved.userId, {
      provisioned: resolved.provisioned,
    });
    return NextResponse.json(payload);
  } catch (e) {
    const pe = serializePrismaClientError(e);
    console.error("[api/account/seller] GET", pe);
    return NextResponse.json(
      {
        error: "Seller settings could not be loaded. Check your database connection or try again.",
        code: pe.code ?? "SELLER_SETTINGS_LOAD_FAILED",
        ...(isQaSessionDebugAllowed() ? { detail: pe.message, prisma: pe } : {}),
      },
      { status: 503 },
    );
  }
}

type PatchBody = {
  shipFromName?: unknown;
  shipFromStreet?: unknown;
  shipFromCity?: unknown;
  shipFromState?: unknown;
  shipFromZip?: unknown;
  shipFromCountry?: unknown;
  shipFromPhone?: unknown;
  defaultShipFromAddressId?: unknown;
};

function trim(s: unknown, max: number): string | undefined {
  if (typeof s !== "string") return undefined;
  const t = s.trim();
  if (!t) return "";
  return t.slice(0, max);
}

export async function PATCH(req: Request) {
  const resolved = await resolveAccountSellerUserId(req);
  if (resolved instanceof NextResponse) return resolved;
  const userId = resolved.userId;

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const shipFromNameInput = trim(body.shipFromName, 200);
  let shipFromName = shipFromNameInput ?? "";
  let shipFromStreet = trim(body.shipFromStreet, 300) ?? "";
  let shipFromCity = trim(body.shipFromCity, 120) ?? "";
  let shipFromStateInput = trim(body.shipFromState, 120) ?? "";
  let shipFromZip = trim(body.shipFromZip, 32) ?? "";
  const shipFromCountryRaw = trim(body.shipFromCountry, 120) ?? "";
  let shipFromCountry = shipFromCountryRaw || SELLER_SHIP_FROM_COUNTRY;
  const shipFromPhone = normalizePhoneForShippo(trim(body.shipFromPhone, 32));

  const baseUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      username: true,
      defaultShipFromAddressId: true,
      shipFromName: true,
      shipFromStreet: true,
      shipFromCity: true,
      shipFromState: true,
      shipFromZip: true,
      shipFromCountry: true,
    },
  });
  if (!baseUser) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Phone-only refresh: reuse saved onboarding address when the client sends just a phone update.
  if (!shipFromStreet.trim() && baseUser.shipFromStreet?.trim()) {
    shipFromName = shipFromName || baseUser.shipFromName?.trim() || "";
    shipFromStreet = baseUser.shipFromStreet.trim();
    shipFromCity = baseUser.shipFromCity?.trim() ?? "";
    shipFromStateInput = baseUser.shipFromState?.trim() ?? "";
    shipFromZip = baseUser.shipFromZip?.trim() ?? "";
    shipFromCountry = baseUser.shipFromCountry?.trim() || SELLER_SHIP_FROM_COUNTRY;
  }

  if (!shipFromStreet || !shipFromCity || !shipFromStateInput || !shipFromZip) {
    return NextResponse.json({ error: "Please complete your address." }, { status: 400 });
  }

  if (!shipFromPhone) {
    return NextResponse.json(
      { error: "A valid US phone number is required for USPS shipping labels." },
      { status: 400 },
    );
  }

  if (shipFromCountry.toUpperCase() !== SELLER_SHIP_FROM_COUNTRY) {
    return NextResponse.json(
      { error: "Only US ship-from addresses are supported during launch." },
      { status: 400 },
    );
  }

  const shipFromState = normalizeUsStateCode(shipFromStateInput) ?? shipFromStateInput;
  const addressUnchanged =
    baseUser.shipFromStreet?.trim() === shipFromStreet.trim() &&
    baseUser.shipFromCity?.trim() === shipFromCity.trim() &&
    (normalizeUsStateCode(baseUser.shipFromState ?? "") ?? baseUser.shipFromState)?.trim() === shipFromState.trim() &&
    baseUser.shipFromZip?.trim() === shipFromZip.trim() &&
    (baseUser.shipFromCountry?.trim() || SELLER_SHIP_FROM_COUNTRY) === shipFromCountry.trim();

  let verifiedShipFrom: Awaited<ReturnType<typeof verifyAddressForShipping>>;
  if (addressUnchanged) {
    verifiedShipFrom = {
      ok: true,
      verified: true,
      corrected: false,
      fields: {
        fullName: shipFromName || baseUser.shipFromName?.trim() || baseUser.name?.trim() || baseUser.username || "Seller",
        line1: shipFromStreet,
        line2: null,
        city: shipFromCity,
        state: shipFromState,
        postalCode: shipFromZip,
        country: shipFromCountry,
      },
      messages: [],
    };
  } else {
    verifiedShipFrom = await verifyAddressForShipping({
      fullName: shipFromName || baseUser.name?.trim() || baseUser.username || "Seller",
      line1: shipFromStreet,
      line2: null,
      city: shipFromCity,
      state: shipFromState,
      postalCode: shipFromZip,
      country: shipFromCountry,
    });
  }
  if (!verifiedShipFrom.ok) {
    return NextResponse.json(
      {
        error: verifiedShipFrom.error,
        code: "ADDRESS_INVALID",
        messages: verifiedShipFrom.messages,
      },
      { status: 422 },
    );
  }

  const verifiedFields = verifiedShipFrom.fields;
  const verifiedStreet = verifiedFields.line1;
  const verifiedCity = verifiedFields.city;
  const verifiedState = verifiedFields.state;
  const verifiedZip = verifiedFields.postalCode;
  const verifiedCountry = verifiedFields.country;
  const verifiedName = verifiedFields.fullName;

  let requestedDefaultShipFromAddressId: string | null | undefined;
  if (body.defaultShipFromAddressId === null || typeof body.defaultShipFromAddressId === "string") {
    requestedDefaultShipFromAddressId =
      typeof body.defaultShipFromAddressId === "string" ? body.defaultShipFromAddressId.trim() || null : null;
  }

  const defaultAddress = await prisma.$transaction(async (tx) => {
    const requestedId = requestedDefaultShipFromAddressId;
    let selectedAddress =
      requestedId
        ? await tx.address.findFirst({
            where: { id: requestedId, userId, type: "ship_from" },
          })
        : null;

    if (!selectedAddress && baseUser.defaultShipFromAddressId) {
      selectedAddress = await tx.address.findFirst({
        where: { id: baseUser.defaultShipFromAddressId, userId, type: "ship_from" },
      });
    }

    if (!selectedAddress) {
      selectedAddress = await tx.address.findFirst({
        where: { userId, type: "ship_from" },
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      });
    }

    const fullName = verifiedName || shipFromName || baseUser.name?.trim() || baseUser.username;
    const name = shipFromName || verifiedName || "Shipping address";
    const email = baseUser.email?.trim() || null;

    await tx.address.updateMany({
      where: { userId, type: "ship_from" },
      data: { isDefault: false },
    });

    if (selectedAddress) {
      return tx.address.update({
        where: { id: selectedAddress.id },
        data: {
          type: "ship_from",
          name,
          fullName,
          line1: verifiedStreet,
          city: verifiedCity,
          state: verifiedState,
          postalCode: verifiedZip,
          country: verifiedCountry,
          email,
          phone: shipFromPhone,
          isDefault: true,
          isVerified: verifiedShipFrom.verified,
        },
      });
    }

    return tx.address.create({
      data: {
        userId,
        type: "ship_from",
        name,
        fullName,
        line1: verifiedStreet,
        city: verifiedCity,
        state: verifiedState,
        postalCode: verifiedZip,
        country: verifiedCountry,
        email,
        phone: shipFromPhone,
        isDefault: true,
        isVerified: verifiedShipFrom.verified,
      },
    });
  });

  await prisma.user.update({
    where: { id: userId },
    data: {
      shipFromName: verifiedName || shipFromName || null,
      shipFromStreet: verifiedStreet,
      shipFromCity: verifiedCity,
      shipFromState: verifiedState,
      shipFromZip: verifiedZip,
      shipFromCountry: verifiedCountry,
      defaultShipFromAddressId: defaultAddress.id,
    },
  });

  await ensureBuyerShippingFromSellerShipFrom(userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      username: true,
      stripeAccountId: true,
      stripeOnboardingComplete: true,
      name: true,
      image: true,
      shipFromName: true,
      shipFromStreet: true,
      shipFromCity: true,
      shipFromState: true,
      shipFromZip: true,
      shipFromCountry: true,
      defaultShipFromAddressId: true,
    },
  });

  const readiness = await getSellerLiveReadiness(userId, prisma);
  return NextResponse.json({
    seller: user
      ? {
          ...user,
          shipFromPhone: defaultAddress.phone,
        }
      : user,
    readiness,
    message: "Shipping address saved.",
  });
}
