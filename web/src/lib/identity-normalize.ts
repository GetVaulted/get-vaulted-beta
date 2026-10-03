/** Shared identity normalization for referral guards and admin linked-account review. */

export function normalizeEmailForComparison(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.indexOf("@");
  if (at < 0) return trimmed;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const plusStripped = local.split("+")[0] ?? local;
  const isGmail = domain === "gmail.com" || domain === "googlemail.com";
  const dotStripped = isGmail ? plusStripped.replace(/\./g, "") : plusStripped;
  return `${dotStripped}@${domain === "googlemail.com" ? "gmail.com" : domain}`;
}

export function normalizeAddressKey(line1: string, zip: string): string {
  const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${norm(line1)}|${norm(zip)}`;
}

export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
}
