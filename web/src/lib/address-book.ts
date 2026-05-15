import type { AddressType } from "@/generated/prisma/enums";

export type AddressInput = {
  type?: unknown;
  name?: unknown;
  fullName?: unknown;
  company?: unknown;
  line1?: unknown;
  line2?: unknown;
  city?: unknown;
  state?: unknown;
  postalCode?: unknown;
  country?: unknown;
  phone?: unknown;
  email?: unknown;
  isDefault?: unknown;
  isVerified?: unknown;
};

const ADDRESS_TYPES: AddressType[] = ["shipping", "return", "billing", "ship_from"];

function asTrimmedString(v: unknown, max = 255): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

function asOptionalString(v: unknown, max = 255): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return asTrimmedString(v, max);
}

export function parseAddressType(v: unknown): AddressType | null {
  if (typeof v !== "string") return null;
  if (!ADDRESS_TYPES.includes(v as AddressType)) return null;
  return v as AddressType;
}

export function validateAddressCreateInput(body: AddressInput):
  | { ok: true; data: {
      type: AddressType;
      name: string;
      fullName: string;
      company: string | null;
      line1: string;
      line2: string | null;
      city: string;
      state: string;
      postalCode: string;
      country: string;
      phone: string | null;
      email: string | null;
      isDefault: boolean;
      isVerified: boolean;
    } }
  | { ok: false; error: string } {
  const type = parseAddressType(body.type);
  const name = asTrimmedString(body.name, 120);
  const fullName = asTrimmedString(body.fullName, 160);
  const line1 = asTrimmedString(body.line1, 200);
  const city = asTrimmedString(body.city, 120);
  const state = asTrimmedString(body.state, 120);
  const postalCode = asTrimmedString(body.postalCode, 32);
  const country = asTrimmedString(body.country, 2) ?? "US";
  if (!type) return { ok: false, error: "Invalid address type." };
  if (!name || !fullName || !line1 || !city || !state || !postalCode) {
    return { ok: false, error: "Missing required address fields." };
  }
  return {
    ok: true,
    data: {
      type,
      name,
      fullName,
      company: asOptionalString(body.company, 160) ?? null,
      line1,
      line2: asOptionalString(body.line2, 200) ?? null,
      city,
      state,
      postalCode,
      country,
      phone: asOptionalString(body.phone, 40) ?? null,
      email: asOptionalString(body.email, 200) ?? null,
      isDefault: Boolean(body.isDefault),
      isVerified: Boolean(body.isVerified),
    },
  };
}

export function validateAddressPatchInput(body: AddressInput):
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string } {
  const data: Record<string, unknown> = {};
  if (body.type !== undefined) {
    const t = parseAddressType(body.type);
    if (!t) return { ok: false, error: "Invalid address type." };
    data.type = t;
  }
  if (body.name !== undefined) data.name = asOptionalString(body.name, 120) ?? null;
  if (body.fullName !== undefined) data.fullName = asOptionalString(body.fullName, 160) ?? null;
  if (body.company !== undefined) data.company = asOptionalString(body.company, 160) ?? null;
  if (body.line1 !== undefined) data.line1 = asOptionalString(body.line1, 200) ?? null;
  if (body.line2 !== undefined) data.line2 = asOptionalString(body.line2, 200) ?? null;
  if (body.city !== undefined) data.city = asOptionalString(body.city, 120) ?? null;
  if (body.state !== undefined) data.state = asOptionalString(body.state, 120) ?? null;
  if (body.postalCode !== undefined) data.postalCode = asOptionalString(body.postalCode, 32) ?? null;
  if (body.country !== undefined) data.country = asOptionalString(body.country, 2) ?? null;
  if (body.phone !== undefined) data.phone = asOptionalString(body.phone, 40) ?? null;
  if (body.email !== undefined) data.email = asOptionalString(body.email, 200) ?? null;
  if (body.isDefault !== undefined) data.isDefault = Boolean(body.isDefault);
  if (body.isVerified !== undefined) data.isVerified = Boolean(body.isVerified);
  if (Object.keys(data).length === 0) {
    return { ok: false, error: "No address fields provided." };
  }
  return { ok: true, data };
}

export function isAddressComplete(a: {
  line1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}): boolean {
  return Boolean(a.line1 && a.city && a.state && a.postalCode && a.country);
}
