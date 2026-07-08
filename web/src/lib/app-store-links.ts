/** Public App Store / Google Play URLs — set when listings are live. */
export function iosAppStoreId(): string {
  const raw = process.env.NEXT_PUBLIC_IOS_APP_STORE_ID?.trim();
  return raw || "6780714456";
}

export function iosAppStoreUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_STORE_URL?.trim();
  if (raw) return raw;
  const id = iosAppStoreId();
  return id ? `https://apps.apple.com/app/id${id}` : null;
}

export function googlePlayUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_GOOGLE_PLAY_URL?.trim();
  if (raw) return raw;
  const pkg = process.env.NEXT_PUBLIC_GOOGLE_PLAY_PACKAGE_ID?.trim() || "com.getvaulted.app";
  return pkg ? `https://play.google.com/store/apps/details?id=${encodeURIComponent(pkg)}` : null;
}

export function appStoreUrlForPlatform(platform: "ios" | "android" | null): string | null {
  if (platform === "ios") return iosAppStoreUrl();
  if (platform === "android") return googlePlayUrl();
  return iosAppStoreUrl() ?? googlePlayUrl();
}

export function hasAnyAppStoreLink(): boolean {
  return Boolean(iosAppStoreUrl() || googlePlayUrl());
}
