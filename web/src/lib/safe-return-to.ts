/** Prisma cuid-style ids from query strings (live checkout context). */
export function safeCuidParam(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (t.length < 18 || t.length > 36) return null;
  if (!/^[a-z0-9]+$/i.test(t)) return null;
  return t;
}

/** Internal navigation target only (blocks open redirects). */
export function safeReturnTo(raw: string | null | undefined): string {
  if (!raw) return "/marketplace";
  const t = raw.trim();
  if (t.startsWith("/") && !t.startsWith("//")) return t;
  try {
    const u = new URL(t);
    return `${u.pathname}${u.search}`;
  } catch {
    return "/marketplace";
  }
}
