import { fetchWebApiAuthed } from '../lib/fetchWebApiAuthed';
import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';

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

function requireApiBase() {
  if (!getWebApiBaseUrl()) {
    throw new Error('Set EXPO_PUBLIC_SITE_URL to use address autocomplete.');
  }
}

export async function searchAddressAutocomplete(
  accessToken: string | undefined,
  query: string,
  country: string,
  container?: string,
): Promise<{ suggestions: AddressAutocompleteSuggestion[]; enabled: boolean; message?: string }> {
  requireApiBase();
  if (!accessToken?.trim()) return { suggestions: [], enabled: false };
  const params = new URLSearchParams({
    q: query.trim(),
    country: country.trim().toUpperCase().slice(0, 2) || 'US',
  });
  if (container?.trim()) params.set('container', container.trim());
  const res = await fetchWebApiAuthed(`/api/account/addresses/autocomplete?${params.toString()}`, accessToken);
  const j = (await res.json().catch(() => ({}))) as {
    suggestions?: AddressAutocompleteSuggestion[];
    enabled?: boolean;
    message?: string;
  };
  return {
    suggestions: Array.isArray(j.suggestions) ? j.suggestions : [],
    enabled: Boolean(j.enabled),
    message: typeof j.message === 'string' ? j.message : undefined,
  };
}

export async function retrieveAutocompleteAddress(
  accessToken: string | undefined,
  id: string,
): Promise<AddressAutocompleteValues> {
  requireApiBase();
  if (!accessToken?.trim()) throw new Error('Sign in to use address autocomplete.');
  const params = new URLSearchParams({ id: id.trim() });
  const res = await fetchWebApiAuthed(
    `/api/account/addresses/autocomplete/retrieve?${params.toString()}`,
    accessToken,
  );
  const j = (await res.json().catch(() => ({}))) as {
    error?: string;
    address?: AddressAutocompleteValues;
  };
  if (!res.ok || !j.address) {
    throw new Error(typeof j.error === 'string' ? j.error : 'Could not load address suggestion.');
  }
  return j.address;
}
