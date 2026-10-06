/**
 * Public profile fields shared by the web + mobile profile editors and the public seller profile:
 * bio, banner image URL and social links. All values are validated here so the API never stores
 * markup, odd schemes or off-platform hosts for the named networks.
 */

export const PROFILE_BIO_MAX = 280;

export const PROFILE_LINK_KEYS = ["instagram", "tiktok", "youtube", "x", "website"] as const;
export type ProfileLinkKey = (typeof PROFILE_LINK_KEYS)[number];
export type ProfileLinks = Partial<Record<ProfileLinkKey, string>>;

export const PROFILE_LINK_LABELS: Record<ProfileLinkKey, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  x: "X",
  website: "Website",
};

/** Plain text bio: no control characters, at most one blank line in a row, capped length. */
export function normalizeProfileBio(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== "string") return undefined;
  const cleaned = raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!cleaned) return null;
  return Array.from(cleaned).slice(0, PROFILE_BIO_MAX).join("").trim();
}

/** Banner must be an absolute http(s) URL (it comes from our own upload route). */
export function normalizeProfileBannerUrl(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  if (!t) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== "https:" && u.protocol !== "http:") return undefined;
  } catch {
    return undefined;
  }
  return t.slice(0, 2048);
}

function parseUrl(input: string): URL | null {
  const t = input.trim();
  if (!t) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password) return null;
    return u;
  } catch {
    return null;
  }
}

function hostIs(u: URL, ...hosts: string[]): boolean {
  const h = u.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  return hosts.includes(h);
}

function handleFromInput(input: string): string {
  return input.trim().replace(/^@/, "");
}

function firstPathSegment(u: URL): string {
  return u.pathname.split("/").filter(Boolean)[0] ?? "";
}

function normalizeInstagram(input: string): string | null {
  const t = input.trim();
  let handle: string;
  if (/^https?:\/\//i.test(t) || /instagram\.com/i.test(t)) {
    const u = parseUrl(t);
    if (!u || !hostIs(u, "instagram.com")) return null;
    handle = firstPathSegment(u);
  } else {
    handle = handleFromInput(t);
  }
  if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) return null;
  return `https://instagram.com/${handle}`;
}

function normalizeTikTok(input: string): string | null {
  const t = input.trim();
  let handle: string;
  if (/^https?:\/\//i.test(t) || /tiktok\.com/i.test(t)) {
    const u = parseUrl(t);
    if (!u || !hostIs(u, "tiktok.com")) return null;
    handle = firstPathSegment(u).replace(/^@/, "");
  } else {
    handle = handleFromInput(t);
  }
  if (!/^[A-Za-z0-9._]{1,24}$/.test(handle)) return null;
  return `https://www.tiktok.com/@${handle}`;
}

function normalizeX(input: string): string | null {
  const t = input.trim();
  let handle: string;
  if (/^https?:\/\//i.test(t) || /(^|\.)(x|twitter)\.com/i.test(t)) {
    const u = parseUrl(t);
    if (!u || !hostIs(u, "x.com", "twitter.com")) return null;
    handle = firstPathSegment(u);
  } else {
    handle = handleFromInput(t);
  }
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) return null;
  return `https://x.com/${handle}`;
}

function normalizeYouTube(input: string): string | null {
  const t = input.trim();
  if (t.startsWith("@") || /^[A-Za-z0-9._-]{3,30}$/.test(t)) {
    const handle = handleFromInput(t);
    if (!/^[A-Za-z0-9._-]{3,30}$/.test(handle)) return null;
    return `https://www.youtube.com/@${handle}`;
  }
  const u = parseUrl(t);
  if (!u || !hostIs(u, "youtube.com", "youtu.be")) return null;
  const path = u.pathname.replace(/\/+$/, "");
  if (hostIs(u, "youtu.be")) return path.length > 1 ? `https://youtu.be${path}` : null;
  if (/^\/(@[A-Za-z0-9._-]+|channel\/[A-Za-z0-9_-]+|c\/[A-Za-z0-9._-]+|user\/[A-Za-z0-9._-]+)$/.test(path)) {
    return `https://www.youtube.com${path}`;
  }
  return null;
}

function normalizeWebsite(input: string): string | null {
  const u = parseUrl(input);
  if (!u) return null;
  const host = u.hostname.toLowerCase();
  if (!host.includes(".") || host.endsWith(".")) return null;
  if (host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
  u.hash = "";
  const out = u.toString();
  if (out.length > 200) return null;
  return out;
}

const NORMALIZERS: Record<ProfileLinkKey, (s: string) => string | null> = {
  instagram: normalizeInstagram,
  tiktok: normalizeTikTok,
  youtube: normalizeYouTube,
  x: normalizeX,
  website: normalizeWebsite,
};

export type ProfileLinksResult =
  | { ok: true; links: ProfileLinks | null }
  | { ok: false; error: string; key: ProfileLinkKey };

/**
 * Validate a `{ key: handleOrUrl }` map. Blank values are dropped; unknown keys are ignored.
 * Returns `links: null` when nothing remains (clears the column).
 */
export function normalizeProfileLinks(raw: unknown): ProfileLinksResult | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return { ok: true, links: null };
  if (typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const src = raw as Record<string, unknown>;
  const out: ProfileLinks = {};
  for (const key of PROFILE_LINK_KEYS) {
    const v = src[key];
    if (v === undefined || v === null) continue;
    if (typeof v !== "string") {
      return { ok: false, key, error: `${PROFILE_LINK_LABELS[key]} link is not valid.` };
    }
    if (!v.trim()) continue;
    const normalized = NORMALIZERS[key](v);
    if (!normalized) {
      return { ok: false, key, error: `${PROFILE_LINK_LABELS[key]} link is not valid.` };
    }
    out[key] = normalized;
  }
  return { ok: true, links: Object.keys(out).length ? out : null };
}

/** Read stored JSON back into a safe, ordered list for display. */
export function profileLinksFromStored(
  stored: unknown,
): { key: ProfileLinkKey; label: string; url: string }[] {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return [];
  const src = stored as Record<string, unknown>;
  const out: { key: ProfileLinkKey; label: string; url: string }[] = [];
  for (const key of PROFILE_LINK_KEYS) {
    const v = src[key];
    if (typeof v !== "string") continue;
    const normalized = NORMALIZERS[key](v);
    if (normalized) out.push({ key, label: PROFILE_LINK_LABELS[key], url: normalized });
  }
  return out;
}

/** Display text for a link chip, e.g. `@mnmheat` or `example.com`. */
export function profileLinkDisplay(key: ProfileLinkKey, url: string): string {
  try {
    const u = new URL(url);
    if (key === "website") return u.hostname.replace(/^www\./, "");
    const seg = firstPathSegment(u);
    if (key === "youtube") return u.hostname === "youtu.be" ? "YouTube video" : seg.startsWith("@") ? seg : "YouTube";
    return `@${seg.replace(/^@/, "")}`;
  } catch {
    return url;
  }
}
