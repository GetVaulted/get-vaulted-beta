import type { AddressType } from "@/generated/prisma/enums";
import {
  verifyAddressForShipping,
  type AddressFieldsForVerification,
  formatAddressVerificationError,
} from "@/lib/shippo-address-validation";

const SHIPPO_VERIFIED_TYPES: AddressType[] = ["shipping", "ship_from"];

export function shouldVerifyAddressType(type: AddressType): boolean {
  return SHIPPO_VERIFIED_TYPES.includes(type);
}

export function addressFieldsFromCreateData(data: {
  fullName: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}): AddressFieldsForVerification {
  return {
    fullName: data.fullName,
    line1: data.line1,
    line2: data.line2,
    city: data.city,
    state: data.state,
    postalCode: data.postalCode,
    country: data.country,
  };
}

export async function verifyAddressCreateData<T extends {
  type: AddressType;
  fullName: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isVerified: boolean;
}>(
  data: T,
): Promise<
  | { ok: true; data: T; corrected: boolean; verificationMessages: string[] }
  | { ok: false; status: number; body: { error: string; code: string; messages: string[] } }
> {
  if (!shouldVerifyAddressType(data.type)) {
    return { ok: true, data: { ...data, isVerified: false }, corrected: false, verificationMessages: [] };
  }

  const verified = await verifyAddressForShipping(addressFieldsFromCreateData(data));
  if (!verified.ok) {
    return {
      ok: false,
      status: 422,
      body: {
        error: verified.error,
        code: "ADDRESS_INVALID",
        messages: verified.messages,
      },
    };
  }

  return {
    ok: true,
    data: {
      ...data,
      fullName: verified.fields.fullName,
      line1: verified.fields.line1,
      line2: verified.fields.line2,
      city: verified.fields.city,
      state: verified.fields.state,
      postalCode: verified.fields.postalCode,
      country: verified.fields.country,
      isVerified: verified.verified,
    },
    corrected: verified.corrected,
    verificationMessages: verified.messages,
  };
}

export async function verifyAddressPatchData(args: {
  existing: {
    type: AddressType;
    fullName: string;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  patch: Record<string, unknown>;
}): Promise<
  | { ok: true; patch: Record<string, unknown>; corrected: boolean; verificationMessages: string[] }
  | { ok: false; status: number; body: { error: string; code: string; messages: string[] } }
> {
  const merged = {
    fullName: (args.patch.fullName as string | undefined) ?? args.existing.fullName,
    line1: (args.patch.line1 as string | undefined) ?? args.existing.line1,
    line2:
      args.patch.line2 !== undefined ? (args.patch.line2 as string | null) : args.existing.line2,
    city: (args.patch.city as string | undefined) ?? args.existing.city,
    state: (args.patch.state as string | undefined) ?? args.existing.state,
    postalCode: (args.patch.postalCode as string | undefined) ?? args.existing.postalCode,
    country: (args.patch.country as string | undefined) ?? args.existing.country,
  };

  const type = (args.patch.type as AddressType | undefined) ?? args.existing.type;
  if (!shouldVerifyAddressType(type)) {
    return { ok: true, patch: args.patch, corrected: false, verificationMessages: [] };
  }

  const verified = await verifyAddressForShipping(merged);
  if (!verified.ok) {
    return {
      ok: false,
      status: 422,
      body: {
        error: formatAddressVerificationError(verified),
        code: "ADDRESS_INVALID",
        messages: verified.messages,
      },
    };
  }

  return {
    ok: true,
    patch: {
      ...args.patch,
      fullName: verified.fields.fullName,
      line1: verified.fields.line1,
      line2: verified.fields.line2,
      city: verified.fields.city,
      state: verified.fields.state,
      postalCode: verified.fields.postalCode,
      country: verified.fields.country,
      isVerified: verified.verified,
    },
    corrected: verified.corrected,
    verificationMessages: verified.messages,
  };
}
