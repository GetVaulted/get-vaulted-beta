/** Standard, not-overly-strict email shape check — rejects obviously malformed input (e.g. missing TLD). */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmailFormat(raw: string): boolean {
  return EMAIL_PATTERN.test(raw.trim());
}
