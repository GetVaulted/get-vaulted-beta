import disposableDomainList from "./data/disposable-email-domains.json";

/**
 * Known disposable/temporary-inbox email domains (Mailinator/Guerrilla-Mail/10-minute-mail style
 * services people use to farm fake signups). Sourced from the community-maintained
 * disposable-email-domains project (github.com/disposable-email-domains/disposable-email-domains,
 * MIT licensed) as of 2026-09-08 — a static snapshot checked into the repo rather than an npm
 * dependency, since this sandbox's npm registry access is blocked. Re-sync periodically by
 * refreshing `src/lib/data/disposable-email-domains.json` from that project's blocklist file.
 */
const DISPOSABLE_DOMAINS: ReadonlySet<string> = new Set(
  (disposableDomainList as string[]).map((d) => d.toLowerCase()),
);

/** Domains we never want to accidentally block, even if a future list refresh includes them. */
const ALLOWLIST: ReadonlySet<string> = new Set(["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com"]);

function extractDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  return email
    .slice(at + 1)
    .trim()
    .toLowerCase()
    // Strip a single trailing dot (valid but rarely-used FQDN form) so it still matches.
    .replace(/\.$/, "");
}

/**
 * True if `email`'s domain (or a parent domain of it — e.g. `foo.mailinator.com` is still
 * blocked because `mailinator.com` is on the list) is a known disposable-email provider.
 * Returns false for malformed input rather than throwing — callers should have already
 * validated the email is well-formed before calling this.
 */
export function isDisposableEmailDomain(email: string): boolean {
  const domain = extractDomain(email);
  if (!domain || ALLOWLIST.has(domain)) return false;
  if (DISPOSABLE_DOMAINS.has(domain)) return true;

  // Walk parent domains: `a.b.mailinator.com` → `b.mailinator.com` → `mailinator.com`.
  const parts = domain.split(".");
  for (let i = 1; i < parts.length - 1; i++) {
    const parent = parts.slice(i).join(".");
    if (ALLOWLIST.has(parent)) return false;
    if (DISPOSABLE_DOMAINS.has(parent)) return true;
  }
  return false;
}

export function disposableEmailDomainCount(): number {
  return DISPOSABLE_DOMAINS.size;
}
