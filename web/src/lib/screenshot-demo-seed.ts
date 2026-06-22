/** Screenshot / marketing demo rows (seed-screenshot-demo.ts). Hidden from public feeds. */

export const SCREENSHOT_DEMO_LISTING_IDS = [
  "shot_m1",
  "shot_m2",
  "shot_m3",
  "shot_m4",
  "shot_m5",
  "shot_m6",
  "shot_m7",
  "shot_m8",
  "shot_m9",
  "shot_m10",
  "shot_m11",
  "shot_m12",
] as const;

export const SCREENSHOT_DEMO_LIVE_ROOM_IDS = [
  "shot_lr_break_hero",
  "shot_lr_break_live2",
  "shot_lr_auction_hero",
  "shot_lr_sale_hero",
  "shot_lr_break_sched",
  "shot_lr_auction_sched",
] as const;

export const SCREENSHOT_DEMO_SELLER_EMAILS = [
  "screenshots.cardvault@getvaultedtest.com",
  "screenshots.grail@getvaultedtest.com",
  "screenshots.luxdrop@getvaultedtest.com",
] as const;

export const SCREENSHOT_DEMO_VIEWER_EMAIL = "screenshots.viewer@getvaultedtest.com";

export const SCREENSHOT_DEMO_LISTING_ID_PREFIX = "shot_";
export const SCREENSHOT_DEMO_LIVE_ROOM_ID_PREFIX = "shot_lr_";
export const SCREENSHOT_DEMO_SELLER_EMAIL_PREFIX = "screenshots.";

export function isScreenshotDemoSellerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  return lower.startsWith(SCREENSHOT_DEMO_SELLER_EMAIL_PREFIX) && lower.endsWith("@getvaultedtest.com");
}

export function isScreenshotDemoListingId(id: string | null | undefined): boolean {
  if (!id) return false;
  return id.startsWith(SCREENSHOT_DEMO_LISTING_ID_PREFIX);
}

export function isScreenshotDemoLiveRoomId(id: string | null | undefined): boolean {
  if (!id) return false;
  return id.startsWith(SCREENSHOT_DEMO_LIVE_ROOM_ID_PREFIX);
}

export function screenshotDemoUserEmails(): string[] {
  return [...SCREENSHOT_DEMO_SELLER_EMAILS, SCREENSHOT_DEMO_VIEWER_EMAIL];
}
