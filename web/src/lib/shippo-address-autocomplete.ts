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

/** Address-bearing string fields — safe to use on nested address objects. */
const ADDRESS_DISPLAY_STRING_KEYS = [
  "complete_address",
  "completeAddress",
  "formatted_address",
  "formatted",
  "text",
  "address_text",
  "display_text",
  "displayText",
  "display",
  "place_name",
  "placeName",
  "matched_text",
  "matchedText",
  "highlight",
] as const;

const NESTED_OBJECT_KEYS = [
  "address",
  "matched_address",
  "matchedAddress",
  "complete_address",
  "recommended_address",
  "recommendedAddress",
  "original_address",
  "originalAddress",
  "prediction",
  "place",
  "result",
] as const;

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
}

function pickString(obj: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function mapV2Address(raw: Record<string, unknown>): ResolvedAutocompleteAddress | null {
  const line1 = pickString(raw, ["address_line_1", "addressLine1", "street1", "line1"]);
  const city = pickString(raw, ["city_locality", "cityLocality", "city"]);
  const stateRaw = pickString(raw, ["state_province", "stateProvince", "state"]);
  const postalCode = pickString(raw, ["postal_code", "postalCode", "zip"]);
  const country = pickString(raw, ["country_code", "countryCode", "country"])?.toUpperCase().slice(0, 2) ?? "US";
  if (!line1 || !city || !stateRaw || !postalCode) return null;
  return {
    line1,
    line2: pickString(raw, ["address_line_2", "addressLine2", "street2", "line2"]) ?? "",
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

function formatResolvedLabel(resolved: ResolvedAutocompleteAddress): string {
  return [
    resolved.line1,
    resolved.line2,
    resolved.city,
    resolved.state,
    resolved.postalCode,
    resolved.country !== "US" ? resolved.country : null,
  ]
    .filter(Boolean)
    .join(", ");
}

function looksLikeAddressLabel(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (/^address suggestion$/i.test(trimmed)) return false;
  if (/^\d/.test(trimmed) || /\d{5}/.test(trimmed)) return true;
  return /,|;/.test(trimmed) || trimmed.split(/\s+/).length >= 3;
}

function labelFromAddressObject(obj: Record<string, unknown>): string | null {
  const complete = pickString(obj, ADDRESS_DISPLAY_STRING_KEYS);
  if (complete) {
    const formatted = formatCompleteAddressLabel(complete);
    if (looksLikeAddressLabel(formatted)) return formatted;
  }

  const parts = [
    pickString(obj, ["address_line_1", "addressLine1", "street1", "line1"]),
    pickString(obj, ["address_line_2", "addressLine2", "street2", "line2"]),
    pickString(obj, ["city_locality", "cityLocality", "city"]),
    pickString(obj, ["state_province", "stateProvince", "state"]),
    pickString(obj, ["postal_code", "postalCode", "zip"]),
  ].filter(Boolean);
  if (parts.length) return parts.join(", ");
  return null;
}

function extractSuggestionLabel(value: unknown, depth = 0): string | null {
  if (depth > 5) return null;

  if (typeof value === "string" && value.trim()) {
    const formatted = formatCompleteAddressLabel(value.trim());
    return looksLikeAddressLabel(formatted) ? formatted : null;
  }

  const rec = asRecord(value);
  if (!rec) return null;

  const primary = pickString(rec, ["primary_text", "primaryText", "main_text", "mainText"]);
  const secondary = pickString(rec, ["secondary_text", "secondaryText"]);
  if (primary && secondary) return `${primary}, ${secondary}`;
  if (primary && looksLikeAddressLabel(primary)) return primary;

  for (const key of NESTED_OBJECT_KEYS) {
    const nested = rec[key];
    if (nested == null) continue;
    if (typeof nested === "string") {
      const formatted = formatCompleteAddressLabel(nested.trim());
      if (looksLikeAddressLabel(formatted)) return formatted;
      continue;
    }
    const nestedObj = asRecord(nested);
    if (nestedObj) {
      const label = labelFromAddressObject(nestedObj);
      if (label) return label;
    }
  }

  const direct = pickString(rec, ADDRESS_DISPLAY_STRING_KEYS);
  if (direct) {
    const formatted = formatCompleteAddressLabel(direct);
    if (looksLikeAddressLabel(formatted)) return formatted;
  }

  const composed = labelFromAddressObject(rec);
  if (composed) return composed;

  return null;
}

function suggestionLabel(row: Record<string, unknown>): string | null {
  return extractSuggestionLabel(row);
}

function suggestionId(row: Record<string, unknown>): string | null {
  return pickString(row, ["id", "object_id", "objectId", "address_id", "addressId"]);
}

function suggestionIsContainer(row: Record<string, unknown>): boolean {
  const flag = row.is_container ?? row.isContainer ?? row.container ?? row.type;
  if (typeof flag === "boolean") return flag;
  if (typeof flag === "string") {
    const t = flag.toLowerCase();
    return t.includes("container") || t === "locality" || t === "region" || t === "place";
  }
  return false;
}

function extractFindRows(payload: unknown): Record<string, unknown>[] {
  const root = asRecord(payload);
  if (!root) return [];
  const list =
    root.results ??
    root.suggestions ??
    root.matches ??
    root.predictions ??
    root.addresses ??
    root.data;
  if (Array.isArray(list)) {
    return list.map(asRecord).filter((r): r is Record<string, unknown> => Boolean(r));
  }
  return [];
}

async function labelForAutocompleteRow(row: Record<string, unknown>): Promise<string | null> {
  const id = suggestionId(row);
  if (id) {
    const resolved = await resolveShippoAutocompleteAddress(id);
    if (resolved) return formatResolvedLabel(resolved);
  }

  const direct = suggestionLabel(row);
  if (direct && looksLikeAddressLabel(direct)) return direct;
  return null;
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
  const labeled = await Promise.all(
    rows.map(async (row) => {
      const id = suggestionId(row);
      if (!id) return null;
      const label = await labelForAutocompleteRow(row);
      if (!label) return null;
      return {
        id,
        label,
        isContainer: suggestionIsContainer(row),
      } satisfies AddressAutocompleteSuggestion;
    }),
  );

  return labeled.filter((row): row is AddressAutocompleteSuggestion => Boolean(row));
}

function parseSemicolonCompleteAddress(raw: string): ResolvedAutocompleteAddress | null {
  const parts = raw.split(";").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;

  const line1 = parts[0] ?? "";
  const countryPart = parts.length >= 3 ? parts[parts.length - 1] : "US";
  const country = countryPart.toUpperCase().slice(0, 2) || "US";
  const cityChunk = parts.length >= 2 ? parts[1] : "";
  const match = cityChunk.match(/^(.+?)\s+([A-Za-z]{2,})\s+(\d{5}(?:-\d{4})?)$/);
  if (!match || !line1) return null;

  const stateRaw = match[2];
  return {
    line1,
    line2: parts.length > 3 ? parts.slice(2, -1).join(", ") : "",
    city: match[1].trim(),
    state: country === "US" ? normalizeUsStateCode(stateRaw) ?? stateRaw : stateRaw,
    postalCode: match[3],
    country,
  };
}

export async function resolveShippoAutocompleteAddress(id: string): Promise<ResolvedAutocompleteAddress | null> {
  if (!id.trim() || !isShippoConfigured()) return null;
  const payload = await shippoAutocompleteRetrieve(id.trim());
  const root = asRecord(payload);
  if (!root) return null;

  const nested =
    asRecord(root.address) ??
    asRecord(root.recommended_address) ??
    asRecord(root.recommendedAddress) ??
    asRecord(root.original_address) ??
    asRecord(root.originalAddress) ??
    root;

  const mapped = mapV2Address(nested);
  if (mapped) return mapped;

  const complete = pickString(nested, ["complete_address", "completeAddress"]);
  if (complete) {
    return parseSemicolonCompleteAddress(complete);
  }

  return null;
}
