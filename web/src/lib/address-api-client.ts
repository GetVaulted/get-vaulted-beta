export type AddressFormPayload = {
  type: "shipping" | "ship_from" | "billing" | "return";
  name: string;
  fullName: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
};

export function buildShippingAddressPayload(input: {
  name: string;
  fullName: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}): AddressFormPayload {
  return {
    type: "shipping",
    name: input.name.trim() || "Shipping",
    fullName: input.fullName.trim(),
    line1: input.line1.trim(),
    line2: input.line2.trim() ? input.line2.trim() : null,
    city: input.city.trim(),
    state: input.state.trim(),
    postalCode: input.postalCode.trim(),
    country: input.country.trim().toUpperCase().slice(0, 2) || "US",
    isDefault: input.isDefault,
  };
}

export type AddressValidateResponse = {
  valid?: boolean;
  verified?: boolean;
  corrected?: boolean;
  skipped?: boolean;
  message?: string;
  error?: string;
  messages?: string[];
  suggested?: {
    fullName: string;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
};

export function formatAddressApiError(body: {
  error?: string;
  messages?: string[];
}): string {
  const primary = typeof body.error === "string" ? body.error : "Could not save address.";
  const extra = Array.isArray(body.messages)
    ? body.messages.filter((m) => typeof m === "string" && m.trim() && m.trim() !== primary)
    : [];
  if (!extra.length) return primary;
  return `${primary}\n${extra.join("\n")}`;
}

export async function validateShippingAddress(payload: AddressFormPayload): Promise<AddressValidateResponse> {
  const res = await fetch("/api/account/addresses/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const j = (await res.json().catch(() => ({}))) as AddressValidateResponse;
  if (!res.ok) {
    throw new Error(formatAddressApiError(j));
  }
  return j;
}

export type AddressAutocompleteSuggestion = {
  id: string;
  label: string;
  isContainer: boolean;
};

export type AddressAutocompleteValues = {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export async function searchAddressAutocomplete(
  query: string,
  country: string,
  container?: string,
): Promise<{ suggestions: AddressAutocompleteSuggestion[]; enabled: boolean; message?: string }> {
  const params = new URLSearchParams({
    q: query.trim(),
    country: country.trim().toUpperCase().slice(0, 2) || "US",
  });
  if (container?.trim()) params.set("container", container.trim());
  const res = await fetch(`/api/account/addresses/autocomplete?${params.toString()}`, { cache: "no-store" });
  const j = (await res.json().catch(() => ({}))) as {
    suggestions?: AddressAutocompleteSuggestion[];
    enabled?: boolean;
    message?: string;
  };
  return {
    suggestions: Array.isArray(j.suggestions) ? j.suggestions : [],
    enabled: Boolean(j.enabled),
    message: typeof j.message === "string" ? j.message : undefined,
  };
}

export async function retrieveAutocompleteAddress(id: string): Promise<AddressAutocompleteValues> {
  const params = new URLSearchParams({ id: id.trim() });
  const res = await fetch(`/api/account/addresses/autocomplete/retrieve?${params.toString()}`, {
    cache: "no-store",
  });
  const j = (await res.json().catch(() => ({}))) as {
    error?: string;
    address?: AddressAutocompleteValues;
  };
  if (!res.ok || !j.address) {
    throw new Error(typeof j.error === "string" ? j.error : "Could not load address suggestion.");
  }
  return j.address;
}
