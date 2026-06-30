import { prisma } from "@/lib/prisma";
import { isStripeTaxFeatureEnabled, normalizeCountryCode, normalizeUsStateCode } from "@/lib/stripe-tax";

/** Why Get Vaulted collects tax in a given state. */
export const TAX_COLLECTION_BASIS = {
  marketplace_facilitator: "marketplace_facilitator",
  direct_nexus: "direct_nexus",
  admin_enabled: "admin_enabled",
  disabled: "disabled",
} as const;

export type TaxCollectionBasis = (typeof TAX_COLLECTION_BASIS)[keyof typeof TAX_COLLECTION_BASIS];

export type TaxDestinationInput = {
  shipState: string | null | undefined;
  shipCountry: string | null | undefined;
};

export type TaxCollectionDecision = {
  collect: boolean;
  stateCode: string | null;
  collectionBasis: TaxCollectionBasis;
};

/**
 * Central gate: collect sales tax only when the buyer's ship-to/delivery state is explicitly enabled.
 * Seller location is never used to trigger collection.
 */
export async function resolveTaxCollectionForDestination(
  destination: TaxDestinationInput,
): Promise<TaxCollectionDecision> {
  if (!isStripeTaxFeatureEnabled()) {
    return { collect: false, stateCode: null, collectionBasis: TAX_COLLECTION_BASIS.disabled };
  }
  if (normalizeCountryCode(destination.shipCountry) !== "US") {
    return { collect: false, stateCode: null, collectionBasis: TAX_COLLECTION_BASIS.disabled };
  }
  const stateCode = normalizeUsStateCode(destination.shipState);
  if (!stateCode) {
    return { collect: false, stateCode: null, collectionBasis: TAX_COLLECTION_BASIS.disabled };
  }

  const row = await prisma.taxNexusState.findUnique({
    where: { stateCode },
    select: { enabled: true, collectionBasis: true },
  });

  if (!row?.enabled) {
    return { collect: false, stateCode, collectionBasis: TAX_COLLECTION_BASIS.disabled };
  }

  const basis = parseCollectionBasis(row.collectionBasis);
  return { collect: true, stateCode, collectionBasis: basis };
}

function parseCollectionBasis(raw: string | null | undefined): TaxCollectionBasis {
  const v = (raw ?? "").trim();
  if (v === TAX_COLLECTION_BASIS.direct_nexus) return TAX_COLLECTION_BASIS.direct_nexus;
  if (v === TAX_COLLECTION_BASIS.admin_enabled) return TAX_COLLECTION_BASIS.admin_enabled;
  return TAX_COLLECTION_BASIS.marketplace_facilitator;
}

/** Ship-to only — seller location is ignored. */
export async function isMarketplaceSaleTaxEligible(args: {
  shipTo: { shipState: string; shipCountry: string };
  sellerShipFrom?: unknown;
}): Promise<boolean> {
  void args.sellerShipFrom;
  const decision = await resolveTaxCollectionForDestination({
    shipState: args.shipTo.shipState,
    shipCountry: args.shipTo.shipCountry,
  });
  return decision.collect;
}

export async function listTaxJurisdictionStates() {
  return prisma.taxNexusState.findMany({ orderBy: { stateCode: "asc" } });
}

export async function setTaxJurisdictionStateEnabled(args: {
  stateCode: string;
  enabled: boolean;
  notes?: string | null;
  collectionBasis?: TaxCollectionBasis;
}) {
  const code = normalizeUsStateCode(args.stateCode);
  if (!code) throw new Error("INVALID_STATE");
  return prisma.taxNexusState.update({
    where: { stateCode: code },
    data: {
      enabled: args.enabled,
      notes: args.notes ?? undefined,
      collectionBasis: args.collectionBasis ?? TAX_COLLECTION_BASIS.marketplace_facilitator,
      registeredAt: args.enabled ? new Date() : null,
    },
  });
}
