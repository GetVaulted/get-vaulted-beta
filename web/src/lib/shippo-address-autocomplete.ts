import { isShippoConfigured, shippoAutocompleteFind, shippoAutocompleteRetrieve } from "@/lib/shippo";
import { normalizeUsStateCode } from "@/lib/us-state-code";

export type AddressAutocompleteSuggestion = {
  id: string;
  label: string;
  /** When true, selecting runs another find with this id as container. */
  isContainer: boolean;
};

export type ResolvedAutocompleteAddress = {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function mapV2Address(raw: Record<string, unknown>): ResolvedAutocompleteAddress | null {
  const line1 = pickString(raw, ["address_line_1", "street1", "line1"]);
  const city = pickString(raw, ["city_locality", "city"]);
  const stateRaw = pickString(raw, ["state_province", "state"]);
  const postalCode = pickString(raw, ["postal_code", "zip", "postalCode"]);
  const country = pickString(raw, ["country_code", "country"])?.toUpperCase().slice(0, 2) ?? "US";
  if (!line1 || !city || !stateRaw || !postalCode) return null;
  return {
    line1,
    line2: pickString(raw, ["address_line_2", "street2", "line2"]) ?? "",
    city,
    state: country === "US" ? normalizeUsStateCode(stateRaw) ?? stateRaw : stateRaw,
    postalCode,
    country,
  };
}

function formatCompleteAddressLabel(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes(";")) {
    return trimmed
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .join(", ");
  }
  return trimmed;
}

function labelFromAddressObject(obj: Record<string, unknown>): string | null {
  const complete = pickString(obj, [
    "complete_address",
    "completeAddress",
    "formatted_address",
    "formatted",
    "text",
    "description",
    "label",
    "address_text",
    "display_text",
  ]);
  if (complete) return formatCompleteAddressLabel(complete);

  const parts = [
    pickString(obj, ["address_line_1", "street1", "line1"]),
    pickString(obj, ["address_line_2", "street2", "line2"]),
    pickString(obj, ["city_locality", "city"]),
    pickString(obj, ["state_province", "state"]),
    pickString(obj, ["postal_code", "zip", "postalCode"]),
  ].filter(Boolean);
  if (parts.length) return parts.join(", ");
  return null;
}

function suggestionLabel(row: Record<string, unknown>): string {
  const direct = pickString(row, [
    "text",
    "description",
    "complete_address",
    "label",
    "address_text",
    "display_text",
    "formatted_address",
    "formatted",
  ]);
  if (direct) return formatCompleteAddressLabel(direct);

  for (const key of [
    "address",
    "matched_address",
    "complete_address",
    "recommended_address",
    "original_address",
  ]) {
    const nested = asRecord(row[key]);
    if (nested) {
      const label = labelFromAddressObject(nested);
      if (label) return label;
    }
  }

  const composed = labelFromAddressObject(row);
  if (composed) return composed;

  return "Address suggestion";
}

function suggestionId(row: Record<string, unknown>): string | null {
  return pickString(row, ["id", "object_id", "address_id"]);
}

function suggestionIsContainer(row: Record<string, unknown>): boolean {
  const flag = row.is_container ?? row.container ?? row.type;
  if (typeof flag === "boolean") return flag;
  if (typeof flag === "string") {
    const t = flag.toLowerCase();
    return t.includes("container") || t === "locality" || t === "region";
  }
  return false;
}

function extractFindRows(payload: unknown): Record<string, unknown>[] {
  const root = asRecord(payload);
  if (!root) return [];
  const list = root.results ?? root.suggestions ?? root.matches ?? root.data;
  if (Array.isArray(list)) {
    return list.map(asRecord).filter((r): r is Record<string, unknown> => Boolean(r));
  }
  return [];
}

export async function searchShippoAddressAutocomplete(args: {
  query: string;
  countryCode: string;
  container?: string;
  limit?: number;
}): Promise<AddressAutocompleteSuggestion[]> {
  const query = args.query.trim();
  if (query.length < 3) return [];
  if (!isShippoConfigured()) return [];

  const payload = await shippoAutocompleteFind({
    address: query,
    countryCode: args.countryCode.trim().toUpperCase().slice(0, 2) || "US",
    container: args.container?.trim() || undefined,
    limit: args.limit ?? 8,
  });

  const rows = extractFindRows(payload);
  const out: AddressAutocompleteSuggestion[] = [];
  for (const row of rows) {
    const id = suggestionId(row);
    if (!id) continue;
    out.push({
      id,
      label: suggestionLabel(row),
      isContainer: suggestionIsContainer(row),
    });
  }
  return out;
}

export async function resolveShippoAutocompleteAddress(id: string): Promise<ResolvedAutocompleteAddress | null> {
  if (!id.trim() || !isShippoConfigured()) return null;
  const payload = await shippoAutocompleteRetrieve(id.trim());
  const root = asRecord(payload);
  if (!root) return null;

  const nested =
    asRecord(root.address) ??
    asRecord(root.recommended_address) ??
    asRecord(root.original_address) ??
    root;

  return mapV2Address(nested);
}
