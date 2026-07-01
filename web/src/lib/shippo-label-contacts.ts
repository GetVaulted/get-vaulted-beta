import type { ShippoAddress } from "@/lib/shippo";

export const SELLER_SHIPPO_CONTACT_MISSING =
  "Seller info missing email or phone. Add your contact phone under Account → Seller before creating USPS labels.";

export type ShippoContactFields = {
  email: string;
  phone: string;
};

export function normalizePhoneForShippo(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  if (digits.length === 10) return digits;
  if (digits.length > 10) return digits.slice(-10);
  return null;
}

export function resolveShippoEmail(...candidates: (string | null | undefined)[]): string | null {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed && trimmed.includes("@")) return trimmed;
  }
  return null;
}

export function resolveSellerShippoContact(args: {
  userEmail?: string | null;
  addressEmail?: string | null;
  addressPhone?: string | null;
}): ShippoContactFields | null {
  const email = resolveShippoEmail(args.addressEmail, args.userEmail);
  const phone = normalizePhoneForShippo(args.addressPhone);
  if (!email || !phone) return null;
  return { email, phone };
}

export function assertSellerShippoContact(
  contact: ShippoContactFields | null,
): asserts contact is ShippoContactFields {
  if (!contact) throw new Error(SELLER_SHIPPO_CONTACT_MISSING);
}

export const BUYER_SHIPPO_CONTACT_MISSING =
  "Buyer shipping address is missing a contact phone. Add one under Account → Wallet before creating labels.";

export function assertBuyerShippoContact(
  contact: ShippoContactFields | null,
): asserts contact is ShippoContactFields {
  if (!contact) throw new Error(BUYER_SHIPPO_CONTACT_MISSING);
}

export function resolveBuyerShippoContact(args: {
  userEmail?: string | null;
  addressEmail?: string | null;
  addressPhone?: string | null;
}): ShippoContactFields | null {
  const email = resolveShippoEmail(args.addressEmail, args.userEmail);
  const phone = normalizePhoneForShippo(args.addressPhone);
  if (!email || !phone) return null;
  return { email, phone };
}

export function withShippoContact(
  address: ShippoAddress,
  contact: Partial<ShippoContactFields>,
): ShippoAddress {
  return {
    ...address,
    ...(contact.email ? { email: contact.email } : {}),
    ...(contact.phone ? { phone: contact.phone } : {}),
  };
}
