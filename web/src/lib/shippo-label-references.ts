/** Shippo label reference helpers — printed on carrier labels when supported (e.g. USPS bottom). */

const REF_MAX = 50;

export function normalizeUsernameForShippoLabel(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim().replace(/^@+/, "") ?? "";
  if (!trimmed) return null;
  const withAt = `@${trimmed}`;
  return withAt.slice(0, REF_MAX);
}

export function truncateShippoLabelReference(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return null;
  return trimmed.slice(0, REF_MAX);
}

/**
 * Shipment `extra` fields that print on the label for many carriers (USPS prints refs at the bottom).
 * Use buyer / counterparty username so sellers can match packs to Get Vaulted accounts.
 */
export function shippoLabelTrackingExtra(args: {
  username?: string | null;
  /** Optional second line (order id, live lot count, etc.). */
  secondary?: string | null;
}): { reference_1: string; reference_2?: string } | Record<string, never> {
  const reference_1 = normalizeUsernameForShippoLabel(args.username);
  const reference_2 = truncateShippoLabelReference(args.secondary);
  if (!reference_1 && !reference_2) return {};
  return {
    ...(reference_1 ? { reference_1 } : {}),
    ...(reference_2 ? { reference_2 } : {}),
  };
}

/** Merge tracking refs onto a Shippo parcel so multi-piece / parcel-level refs still print. */
export function withShippoParcelLabelTracking<T extends Record<string, unknown>>(
  parcel: T,
  tracking: ReturnType<typeof shippoLabelTrackingExtra>,
): T & { extra?: Record<string, unknown> } {
  if (!tracking.reference_1 && !("reference_2" in tracking && tracking.reference_2)) {
    return parcel;
  }
  const prevExtra =
    parcel.extra && typeof parcel.extra === "object" && !Array.isArray(parcel.extra)
      ? (parcel.extra as Record<string, unknown>)
      : {};
  return {
    ...parcel,
    extra: {
      ...prevExtra,
      ...tracking,
    },
  };
}
