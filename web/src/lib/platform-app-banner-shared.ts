/** Client-safe banner constants/types — keep Prisma out of this module. */

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
