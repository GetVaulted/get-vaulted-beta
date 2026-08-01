import { prisma } from "@/lib/prisma";

const CONFIG_ID = "default";
const CACHE_TTL_MS = 5_000;

export const APP_BANNER_TITLE_MAX = 80;
export const APP_BANNER_BODY_MAX = 220;
export const APP_BANNER_CTA_MAX = 40;
export const APP_BANNER_HREF_MAX = 240;
export const APP_BANNER_DISMISS_KEY_MAX = 64;

export type PlatformAppBannerDTO = {
  enabled: boolean;
  title: string;
  body: string;
  ctaLabel: string;
  href: string;
  dismissKey: string;
  startsAt: string | null;
  endsAt: string | null;
  updatedAt: string | null;
};

export type PublicAppBannerDTO = {
  title: string;
  body: string;
  ctaLabel: string;
  href: string;
  dismissKey: string;
};

const DEFAULT_SEED = {
  enabled: false,
  title: "Invite friends. Earn credit.",
  body: "Share your referral link — when friends join and buy, you earn store credit.",
  ctaLabel: "Get my link",
  href: "/account/referrals",
  dismissKey: "referral-v1",
} as const;

let cachedRow: PlatformAppBannerDTO | null = null;
let cachedAt = 0;

function clampText(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, max);
}

function normalizeHref(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (t.startsWith("/")) return t.slice(0, APP_BANNER_HREF_MAX);
  // Allow full https URLs for rare external promos; block other schemes.
  if (/^https:\/\//i.test(t)) return t.slice(0, APP_BANNER_HREF_MAX);
  return "";
}

function rowToDto(row: {
  enabled: boolean;
  title: string;
  body: string;
  ctaLabel: string;
  href: string;
  dismissKey: string;
  startsAt: Date | null;
  endsAt: Date | null;
  updatedAt: Date;
}): PlatformAppBannerDTO {
  return {
    enabled: row.enabled,
    title: row.title,
    body: row.body,
    ctaLabel: row.ctaLabel,
    href: row.href,
    dismissKey: row.dismissKey || "default",
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function invalidatePlatformAppBannerCache(): void {
  cachedRow = null;
  cachedAt = 0;
}

async function ensureRow(): Promise<PlatformAppBannerDTO> {
  const existing = await prisma.platformAppBanner.findUnique({ where: { id: CONFIG_ID } });
  if (existing) return rowToDto(existing);
  const created = await prisma.platformAppBanner.create({
    data: { id: CONFIG_ID, ...DEFAULT_SEED },
  });
  return rowToDto(created);
}

export async function getPlatformAppBannerAdmin(force = false): Promise<PlatformAppBannerDTO> {
  if (!force && cachedRow && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedRow;
  }
  try {
    cachedRow = await ensureRow();
  } catch {
    if (cachedRow) return cachedRow;
    return {
      ...DEFAULT_SEED,
      startsAt: null,
      endsAt: null,
      updatedAt: null,
    };
  }
  cachedAt = Date.now();
  return cachedRow;
}

/** Active banner for clients, or null when off / outside schedule / incomplete. */
export function resolvePublicAppBanner(
  row: PlatformAppBannerDTO,
  nowMs = Date.now(),
): PublicAppBannerDTO | null {
  if (!row.enabled) return null;
  const title = row.title.trim();
  const body = row.body.trim();
  if (!title && !body) return null;
  if (row.startsAt) {
    const start = Date.parse(row.startsAt);
    if (Number.isFinite(start) && nowMs < start) return null;
  }
  if (row.endsAt) {
    const end = Date.parse(row.endsAt);
    if (Number.isFinite(end) && nowMs > end) return null;
  }
  return {
    title,
    body,
    ctaLabel: row.ctaLabel.trim(),
    href: row.href.trim(),
    dismissKey: row.dismissKey.trim() || "default",
  };
}

export async function getPublicAppBanner(force = false): Promise<PublicAppBannerDTO | null> {
  const row = await getPlatformAppBannerAdmin(force);
  return resolvePublicAppBanner(row);
}

export type AppBannerUpdateInput = {
  enabled?: boolean;
  title?: string;
  body?: string;
  ctaLabel?: string;
  href?: string;
  dismissKey?: string;
  startsAt?: string | null;
  endsAt?: string | null;
};

export function parseAppBannerUpdate(body: unknown):
  | { ok: true; data: AppBannerUpdateInput }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid JSON." };
  }
  const o = body as Record<string, unknown>;
  const data: AppBannerUpdateInput = {};

  if ("enabled" in o) {
    if (typeof o.enabled !== "boolean") return { ok: false, error: "enabled must be a boolean." };
    data.enabled = o.enabled;
  }
  if ("title" in o) data.title = clampText(o.title, APP_BANNER_TITLE_MAX);
  if ("body" in o) data.body = clampText(o.body, APP_BANNER_BODY_MAX);
  if ("ctaLabel" in o) data.ctaLabel = clampText(o.ctaLabel, APP_BANNER_CTA_MAX);
  if ("href" in o) {
    const href = normalizeHref(typeof o.href === "string" ? o.href : "");
    if (typeof o.href === "string" && o.href.trim() && !href) {
      return { ok: false, error: "href must be an app path (e.g. /account/referrals) or https URL." };
    }
    data.href = href;
  }
  if ("dismissKey" in o) {
    const key = clampText(o.dismissKey, APP_BANNER_DISMISS_KEY_MAX).replace(/[^a-zA-Z0-9._-]/g, "");
    data.dismissKey = key || "default";
  }
  if ("startsAt" in o) {
    if (o.startsAt == null || o.startsAt === "") data.startsAt = null;
    else if (typeof o.startsAt === "string" && Number.isFinite(Date.parse(o.startsAt))) {
      data.startsAt = new Date(o.startsAt).toISOString();
    } else {
      return { ok: false, error: "startsAt must be an ISO date or empty." };
    }
  }
  if ("endsAt" in o) {
    if (o.endsAt == null || o.endsAt === "") data.endsAt = null;
    else if (typeof o.endsAt === "string" && Number.isFinite(Date.parse(o.endsAt))) {
      data.endsAt = new Date(o.endsAt).toISOString();
    } else {
      return { ok: false, error: "endsAt must be an ISO date or empty." };
    }
  }

  if (Object.keys(data).length === 0) {
    return { ok: false, error: "No valid updates." };
  }
  return { ok: true, data };
}

export async function updatePlatformAppBanner(
  input: AppBannerUpdateInput,
  updatedByUserId: string | null,
): Promise<PlatformAppBannerDTO> {
  await ensureRow();
  const updated = await prisma.platformAppBanner.update({
    where: { id: CONFIG_ID },
    data: {
      ...(input.enabled != null ? { enabled: input.enabled } : {}),
      ...(input.title != null ? { title: input.title } : {}),
      ...(input.body != null ? { body: input.body } : {}),
      ...(input.ctaLabel != null ? { ctaLabel: input.ctaLabel } : {}),
      ...(input.href != null ? { href: input.href } : {}),
      ...(input.dismissKey != null ? { dismissKey: input.dismissKey } : {}),
      ...(input.startsAt !== undefined
        ? { startsAt: input.startsAt ? new Date(input.startsAt) : null }
        : {}),
      ...(input.endsAt !== undefined ? { endsAt: input.endsAt ? new Date(input.endsAt) : null } : {}),
      updatedByUserId,
    },
  });
  invalidatePlatformAppBannerCache();
  cachedRow = rowToDto(updated);
  cachedAt = Date.now();
  return cachedRow;
}
