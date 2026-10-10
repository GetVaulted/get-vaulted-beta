import { prisma } from "@/lib/prisma";

/** Switches an owner can flip from /admin/settings. Add new ones here; the page renders from this list. */
export const ADMIN_SETTINGS = [
  {
    key: "seller_applications_enforced",
    label: "Require seller approval before selling",
    help: "When on, members must be approved (Seller Applications) before they can list or host shows. Grandfathered sellers keep access. Off by default.",
    envFallback: "SELLER_APPLICATIONS_ENFORCED",
  },
] as const;

export type AdminSettingKey = (typeof ADMIN_SETTINGS)[number]["key"];

export function parseBoolSetting(raw: string | null | undefined): boolean | null {
  if (raw == null) return null;
  const v = raw.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return null;
}

const CACHE_MS = 30_000;
const cache = new Map<string, { at: number; value: string | null }>();

export function clearAdminSettingCache() {
  cache.clear();
}

/** Raw stored value (null when never set). Cached 30s per server instance; never throws. */
export async function getStoredAdminSetting(key: AdminSettingKey, now = Date.now()): Promise<string | null> {
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_MS) return hit.value;
  try {
    const row = await prisma.adminSetting.findUnique({ where: { key }, select: { value: true } });
    cache.set(key, { at: now, value: row?.value ?? null });
    return row?.value ?? null;
  } catch {
    return hit?.value ?? null;
  }
}

/** Effective boolean: the saved admin setting wins; otherwise the env var; otherwise false. */
export async function getBoolAdminSetting(key: AdminSettingKey): Promise<boolean> {
  const stored = parseBoolSetting(await getStoredAdminSetting(key));
  if (stored !== null) return stored;
  const def = ADMIN_SETTINGS.find((s) => s.key === key);
  return parseBoolSetting(def ? process.env[def.envFallback] : null) ?? false;
}
