/** Public App Store / Google Play URLs — set when listings are live. */
export function iosAppStoreUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_STORE_URL?.trim();
  return raw || null;
}

export function googlePlayUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_GOOGLE_PLAY_URL?.trim();
  return raw || null;
}

export function hasAnyAppStoreLink(): boolean {
  return Boolean(iosAppStoreUrl() || googlePlayUrl());
}
