import { normalizeUsStateCode } from "@/lib/us-state-code";
import { isShippoConfigured, shippoValidateAddress, type ShippoValidatedAddressResponse } from "@/lib/shippo";

export type AddressFieldsForVerification = {
  fullName: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type AddressVerificationResult =
  | {
      ok: true;
      verified: boolean;
      fields: AddressFieldsForVerification;
      corrected: boolean;
      messages: string[];
    }
  | {
      ok: false;
      error: string;
      messages: string[];
    };

function trimField(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

function normalizeVerifiedState(state: string, country: string): string {
  if (country === "US") return normalizeUsStateCode(state) ?? state;
  return state;
}

function shippoMessages(response: ShippoValidatedAddressResponse): string[] {
  const raw = response.validation_results?.messages ?? [];
  const texts = raw
    .map((m) => (typeof m.text === "string" ? m.text.trim() : ""))
    .filter(Boolean);
  return [...new Set(texts)];
}

function fieldsFromShippoResponse(
  input: AddressFieldsForVerification,
  response: ShippoValidatedAddressResponse,
): AddressFieldsForVerification {
  const country = trimField(response.country, 2)?.toUpperCase() ?? input.country;
  const line1 = trimField(response.street1, 200) ?? input.line1;
  const line2 = trimField(response.street2, 200) ?? input.line2;
  const city = trimField(response.city, 120) ?? input.city;
  const stateRaw = trimField(response.state, 120) ?? input.state;
  const postalCode = trimField(response.zip, 32) ?? input.postalCode;
  return {
    fullName: trimField(response.name, 160) ?? input.fullName,
    line1,
    line2,
    city,
    state: normalizeVerifiedState(stateRaw, country),
    postalCode,
    country,
  };
}

function fieldsChanged(before: AddressFieldsForVerification, after: AddressFieldsForVerification): boolean {
  return (
    before.fullName !== after.fullName ||
    before.line1 !== after.line1 ||
    (before.line2 ?? "") !== (after.line2 ?? "") ||
    before.city !== after.city ||
    before.state !== after.state ||
    before.postalCode !== after.postalCode ||
    before.country !== after.country
  );
}

function shippoSaysValid(response: ShippoValidatedAddressResponse): boolean {
  if (response.validation_results?.is_valid === true) return true;
  if (response.validation_results?.is_valid === false) return false;
  const state = (response.object_state ?? "").toUpperCase();
  if (state === "VALID") return true;
  if (state === "INVALID") return false;
  return true;
}

/** Verify a ship-to / ship-from address with Shippo when configured. */
export async function verifyAddressForShipping(
  input: AddressFieldsForVerification,
): Promise<AddressVerificationResult> {
  if (!isShippoConfigured()) {
    return { ok: true, verified: false, fields: input, corrected: false, messages: [] };
  }

  try {
    const response = await shippoValidateAddress({
      name: input.fullName,
      street1: input.line1,
      street2: input.line2 ?? undefined,
      city: input.city,
      state: input.state,
      zip: input.postalCode,
      country: input.country,
    });

    const messages = shippoMessages(response);
    if (!shippoSaysValid(response)) {
      return {
        ok: false,
        error: messages[0] ?? "Address could not be verified. Check street, city, state, and ZIP.",
        messages: messages.length
          ? messages
          : ["Address could not be verified. Check street, city, state, and ZIP."],
      };
    }

    const fields = fieldsFromShippoResponse(input, response);
    return {
      ok: true,
      verified: true,
      fields,
      corrected: fieldsChanged(input, fields),
      messages,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: "Address verification is temporarily unavailable. Try again in a moment.",
      messages: [msg.slice(0, 240)],
    };
  }
}

export function formatAddressVerificationError(result: Extract<AddressVerificationResult, { ok: false }>): string {
  if (result.messages.length <= 1) return result.error;
  return `${result.error}\n${result.messages.slice(1).join("\n")}`;
}
