import { normalizeUsStateCode } from "@/lib/us-state-code";
import type { ShippoAddress } from "@/lib/shippo";

export type StructuredShipAddress = {
  name: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

/** Normalize US ZIP to 5 digits (or 5+4) for consistent Shippo zone lookup. */
export function normalizeUsPostalCode(postalCode: string): string {
  const trimmed = postalCode.trim();
  const match = trimmed.match(/^(\d{5})(?:-?(\d{4}))?/);
  if (!match) return trimmed.slice(0, 32);
  return match[2] ? `${match[1]}-${match[2]}` : match[1]!;
}

export function normalizeQuoteCountry(country: string): string {
  const c = country.trim().toUpperCase();
  if (!c || c === "USA" || c === "UNITED STATES") return "US";
  return c.slice(0, 2);
}

/** Build a Shippo address with normalized state/ZIP for live rate quotes. */
export function toShippoQuoteAddress(
  input: StructuredShipAddress,
  opts?: { residential?: boolean },
): ShippoAddress & { is_residential?: boolean } {
  const country = normalizeQuoteCountry(input.country);
  const state =
    country === "US"
      ? normalizeUsStateCode(input.state) ?? input.state.trim().slice(0, 120)
      : input.state.trim().slice(0, 120);
  const zip = country === "US" ? normalizeUsPostalCode(input.postalCode) : input.postalCode.trim().slice(0, 32);

  const body: ShippoAddress & { is_residential?: boolean } = {
    name: input.name.trim().slice(0, 200) || "Recipient",
    street1: input.line1.trim().slice(0, 500),
    city: input.city.trim().slice(0, 120),
    state,
    zip,
    country,
  };
  const line2 = input.line2?.trim();
  if (line2) body.street2 = line2.slice(0, 500);
  if (opts?.residential) body.is_residential = true;
  return body;
}

export function formatShipFromLabel(address: StructuredShipAddress): string {
  const city = address.city.trim();
  const state =
    normalizeQuoteCountry(address.country) === "US"
      ? normalizeUsStateCode(address.state) ?? address.state.trim()
      : address.state.trim();
  if (city && state) return `${city}, ${state}`;
  return city || state || "Seller location";
}
