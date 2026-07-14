import { prisma } from "@/lib/prisma";
import { hasCompleteSellerShipFrom } from "@/lib/seller-shipping-readiness";
import {
  isShippoConfigured,
  shippoCreateShipment,
  shippoListRates,
  type ShippoParcel,
} from "@/lib/shippo";
import { normalizePhoneForShippo } from "@/lib/shippo-label-contacts";
import { toShippoQuoteAddress, type StructuredShipAddress } from "@/lib/shippo-quote-address";
import { defaultTradeParcelForTier, normalizeTradeWeightTier } from "@/lib/trade-parcel-defaults";

export type TradeShipAddress = StructuredShipAddress & {
  phone: string | null;
  email: string | null;
};

export type TradeOutboundShippingQuote = {
  amountCents: number;
  amountUsd: number;
  carrier: string;
  serviceLevel: string;
  shippoShipmentId: string;
  shippoRateObjectId: string;
  mock: boolean;
};

type ShippoRateRow = {
  object_id?: string;
  amount?: string | number;
  provider?: string;
  servicelevel?: { name?: string; token?: string };
};

function parseRateAmountCents(amount: string | number | undefined): number | null {
  if (amount == null) return null;
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

async function loadTradeParticipantShipAddress(userId: string): Promise<TradeShipAddress | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      username: true,
      name: true,
      shipFromName: true,
      shipFromStreet: true,
      shipFromCity: true,
      shipFromState: true,
      shipFromZip: true,
      shipFromCountry: true,
      defaultShipFromAddressId: true,
      defaultShipFromAddress: {
        select: {
          fullName: true,
          line1: true,
          line2: true,
          city: true,
          state: true,
          postalCode: true,
          country: true,
          phone: true,
          email: true,
        },
      },
    },
  });
  if (!user) return null;

  const ready = hasCompleteSellerShipFrom({
    shipFromStreet: user.shipFromStreet,
    shipFromCity: user.shipFromCity,
    shipFromState: user.shipFromState,
    shipFromZip: user.shipFromZip,
    shipFromCountry: user.shipFromCountry,
    defaultShipFromAddressId: user.defaultShipFromAddressId,
    defaultShipFromAddress: user.defaultShipFromAddress,
    shipFromPhone: user.defaultShipFromAddress?.phone ?? null,
  });
  if (!ready) return null;

  const addr = user.defaultShipFromAddress;
  if (addr?.line1 && addr.city && addr.state && addr.postalCode && addr.country) {
    return {
      name: addr.fullName?.trim() || user.shipFromName?.trim() || user.name?.trim() || user.username || "Trader",
      line1: addr.line1,
      line2: addr.line2,
      city: addr.city,
      state: addr.state,
      postalCode: addr.postalCode,
      country: addr.country,
      phone: normalizePhoneForShippo(addr.phone),
      email: addr.email?.trim() || user.email,
    };
  }

  if (!user.shipFromStreet || !user.shipFromCity || !user.shipFromState || !user.shipFromZip || !user.shipFromCountry) {
    return null;
  }

  return {
    name: user.shipFromName?.trim() || user.name?.trim() || user.username || "Trader",
    line1: user.shipFromStreet,
    line2: null,
    city: user.shipFromCity,
    state: user.shipFromState,
    postalCode: user.shipFromZip,
    country: user.shipFromCountry,
    phone: normalizePhoneForShippo(addr?.phone),
    email: addr?.email?.trim() || user.email,
  };
}

function toShippoAddressWithContact(addr: TradeShipAddress, opts?: { residential?: boolean }) {
  const base = toShippoQuoteAddress(addr, opts);
  if (addr.phone) base.phone = addr.phone;
  if (addr.email) base.email = addr.email;
  return base;
}

function mockTradeShippingQuote(parcel: ShippoParcel): TradeOutboundShippingQuote {
  void parcel;
  return {
    amountCents: 595,
    amountUsd: 5.95,
    carrier: "USPS",
    serviceLevel: "Priority Mail (estimate)",
    shippoShipmentId: "mock_shipment",
    shippoRateObjectId: "mock_rate",
    mock: true,
  };
}

/**
 * Quote the payer's outbound Shippo rate: from their ship-from → counterparty ship-from.
 * Both parties must have complete Seller HQ ship-from (address + phone).
 */
export async function fetchTradeOutboundShippingQuote(args: {
  tradeOfferId: string;
  payerUserId: string;
}): Promise<
  | { ok: true; quote: TradeOutboundShippingQuote; counterpartyUserId: string }
  | { ok: false; error: string; status: number }
> {
  const offer = await prisma.tradeOffer.findUnique({
    where: { id: args.tradeOfferId },
    select: {
      id: true,
      status: true,
      proposerId: true,
      recipientId: true,
      shippingWeightTier: true,
      proposerPlatformFeePaidAt: true,
      recipientPlatformFeePaidAt: true,
    },
  });
  if (!offer) return { ok: false, error: "Offer not found.", status: 404 };
  if (offer.status !== "accepted" && offer.status !== "completed") {
    return { ok: false, error: "Shipping is only available after the trade is accepted.", status: 409 };
  }

  const isProposer = offer.proposerId === args.payerUserId;
  const isRecipient = offer.recipientId === args.payerUserId;
  if (!isProposer && !isRecipient) {
    return { ok: false, error: "Only trade participants can quote shipping.", status: 403 };
  }

  const alreadyPaid = isProposer
    ? Boolean(offer.proposerPlatformFeePaidAt)
    : Boolean(offer.recipientPlatformFeePaidAt);
  if (alreadyPaid) {
    return { ok: false, error: "You already paid for this trade checkout.", status: 409 };
  }

  const counterpartyUserId = isProposer ? offer.recipientId : offer.proposerId;
  const from = await loadTradeParticipantShipAddress(args.payerUserId);
  const to = await loadTradeParticipantShipAddress(counterpartyUserId);

  if (!from) {
    return {
      ok: false,
      error: "Add your ship-from address and phone in Seller HQ before paying for your label.",
      status: 409,
    };
  }
  if (!to) {
    return {
      ok: false,
      error: "Your trade partner still needs to add their ship-from address and phone in Seller HQ.",
      status: 409,
    };
  }

  const parcel = defaultTradeParcelForTier(normalizeTradeWeightTier(offer.shippingWeightTier));

  if (!isShippoConfigured()) {
    return { ok: true, quote: mockTradeShippingQuote(parcel), counterpartyUserId };
  }

  try {
    const shipment = (await shippoCreateShipment({
      address_from: toShippoAddressWithContact(from),
      address_to: toShippoAddressWithContact(to, { residential: true }),
      parcels: [parcel],
      async: false,
    })) as { object_id?: string; rates?: ShippoRateRow[] };

    const shipmentId = shipment.object_id?.trim();
    if (!shipmentId) {
      return { ok: false, error: "Could not create a shipping quote. Try again.", status: 502 };
    }

    const inlineRates = Array.isArray(shipment.rates) ? shipment.rates : [];
    const ratesRes =
      inlineRates.length > 0
        ? { results: inlineRates }
        : ((await shippoListRates(shipmentId)) as { results?: ShippoRateRow[] });

    const ranked = (ratesRes.results ?? [])
      .map((row) => {
        const cents = parseRateAmountCents(row.amount);
        const rateId = row.object_id?.trim();
        if (cents == null || cents <= 0 || !rateId) return null;
        return {
          amountCents: cents,
          amountUsd: cents / 100,
          carrier: (row.provider ?? "Carrier").trim() || "Carrier",
          serviceLevel: (row.servicelevel?.name ?? row.servicelevel?.token ?? "Shipping").trim() || "Shipping",
          shippoShipmentId: shipmentId,
          shippoRateObjectId: rateId,
          mock: false as const,
        };
      })
      .filter((q): q is TradeOutboundShippingQuote => Boolean(q))
      .sort((a, b) => a.amountCents - b.amountCents);

    const best = ranked[0];
    if (!best) {
      return { ok: false, error: "No shipping rates available for this package. Check ship-from details.", status: 502 };
    }

    return { ok: true, quote: best, counterpartyUserId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Shipping quote failed.";
    console.error("[fetchTradeOutboundShippingQuote]", msg);
    return { ok: false, error: "Could not quote shipping right now. Try again shortly.", status: 502 };
  }
}

export { loadTradeParticipantShipAddress, toShippoAddressWithContact };
