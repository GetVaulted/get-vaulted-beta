export type MobileWebPlatform = "ios" | "android";

/** True for phone/tablet browsers — not the native Get Vaulted app. */
export function isMobileWebUserAgent(userAgent: string): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
}

export function mobileWebPlatform(userAgent: string): MobileWebPlatform | null {
  if (/iPad|iPhone|iPod/i.test(userAgent)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return null;
}
