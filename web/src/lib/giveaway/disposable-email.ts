/** Disposable / throwaway email domains for giveaway fraud flagging (not hard-block). */
const DISPOSABLE_DOMAINS = new Set(
  [
    "mailinator.com",
    "guerrillamail.com",
    "guerrillamail.de",
    "sharklasers.com",
    "grr.la",
    "yopmail.com",
    "tempmail.com",
    "temp-mail.org",
    "10minutemail.com",
    "throwaway.email",
    "trashmail.com",
    "getnada.com",
    "maildrop.cc",
    "dispostable.com",
    "fakeinbox.com",
    "mailnesia.com",
  ].map((d) => d.toLowerCase()),
);

export function isDisposableEmailDomain(email: string): boolean {
  const at = email.trim().toLowerCase().lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.trim().toLowerCase().slice(at + 1);
  return DISPOSABLE_DOMAINS.has(domain);
}

/** Known internal / test email patterns (flag, don't auto-block). */
export function looksLikeTestAccountEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  return (
    e.endsWith("@example.com") ||
    e.endsWith(".test") ||
    e.includes("+test@") ||
    e.startsWith("test+") ||
    e.startsWith("qa+") ||
    e.includes("getvaulted+test")
  );
}
